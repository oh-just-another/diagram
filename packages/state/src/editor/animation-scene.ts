import type { ElementId } from "@oh-just-another/types";
import { bounds as B } from "@oh-just-another/math";
import {
  apply,
  getBinaryFile,
  getElementWorldBounds,
  isImage,
  sniffBinaryFileMime,
} from "@oh-just-another/scene";
import { isDrawableImageSource } from "@oh-just-another/renderer-core";
import { HEAVY_GIF_BYTES } from "../constants.js";
import { hasAnimatedElement } from "./public/image-insert.js";
import { createHiddenLoopingVideo } from "../features/built-in-handlers.js";
import type { Editor } from "../editor.js";

/**
 * True when at least one animated shape's world AABB intersects the current
 * viewport. Drives viewport-culling of the animation tick — off-screen GIFs
 * don't burn decode / render cost.
 */
export const hasVisibleAnimatedElement = (editor: Editor): boolean => {
  if (!hasAnimatedElement(editor._scene)) return false;
  const viewport = editor.computeViewportWorld();
  if (!viewport) return true; // no viewport yet — don't suppress
  for (const shape of editor._scene.elements.values()) {
    if (shape.metadata?.animated !== true) continue;
    if (B.intersects(getElementWorldBounds(shape), viewport)) return true;
  }
  return false;
};

/**
 * Freeze heavy GIFs after `GIF_AUTOSTOP_MS` of continuous play (light GIFs loop
 * forever). Collects the heavy ids by payload size and hands them to the
 * playback controller. Called from the tick before each animation render.
 */
export const autoStopHeavyGifs = (editor: Editor): void => {
  const heavyIds: ElementId[] = [];
  for (const shape of editor._scene.elements.values()) {
    if (!isImage(shape)) continue;
    if (!shape.animationKind) continue;
    const heavy =
      shape.animationData instanceof ArrayBuffer &&
      shape.animationData.byteLength > HEAVY_GIF_BYTES;
    if (heavy) heavyIds.push(shape.id);
  }
  editor.gifPlayback.autoStopHeavy(heavyIds);
};

/**
 * Restore transient `animationData` for animated image shapes after a scene
 * load: the raw bytes don't survive serialisation but persist in `Scene.files`
 * via `fileId`, so copy them back so the animation adapter can produce frames.
 * Applied directly to `_scene` (no history entry — internal rehydration).
 */
export const rehydrateAnimatedImages = (editor: Editor): void => {
  for (const shape of editor._scene.elements.values()) {
    if (!isImage(shape)) continue;
    if (!shape.animationKind) continue;
    editor.gifPlayback.ensure(shape.id);
    if (!shape.fileId) continue;
    if (shape.animationData instanceof ArrayBuffer) continue; // already live
    const file = getBinaryFile(editor._scene, shape.fileId);
    if (!file) continue;
    editor._scene = apply(editor._scene, {
      kind: "element",
      id: shape.id,
      before: shape,
      after: { ...shape, animationData: file.data },
    });
  }
};

/**
 * Decode raw image bytes into a live drawable handle. Prefers `ImageBitmap`
 * (every backend draws it, incl. the OffscreenCanvas worker); falls back to a
 * decoded `<img>` via an object-URL where `createImageBitmap` is unavailable.
 * Resolves `null` when neither path works (SSR / decode failure).
 */
const decodeImageHandle = async (
  data: ArrayBuffer,
  mime: string,
): Promise<ImageBitmap | HTMLImageElement | null> => {
  if (typeof Blob === "undefined") return null;
  const blob = new Blob([data], { type: mime || "application/octet-stream" });
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through to the <img> path (e.g. some SVGs) */
    }
  }
  if (
    typeof Image !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    const url = URL.createObjectURL(blob);
    return new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }
  return null;
};

/**
 * Rebuild the live `<video>` handle for a restored video shape: a fresh
 * blob URL over the persisted bytes, mounted as the same hidden, muted,
 * looping element the drop handler creates. Resolves when the element has
 * its first frame (or `null` on error / SSR); playback resumes best-effort
 * (autoplay may need a user gesture — the muted flag usually suffices).
 */
const rehydrateVideoHandle = async (
  data: ArrayBuffer,
  mime: string,
): Promise<HTMLVideoElement | null> => {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const video = createHiddenLoopingVideo(url);
  const ok = await new Promise<boolean>((resolve) => {
    video.onloadedmetadata = () => {
      resolve(true);
    };
    video.onerror = () => {
      resolve(false);
    };
  });
  if (!ok) {
    URL.revokeObjectURL(url);
    video.remove();
    return null;
  }
  void video.play().catch(() => {
    /* intentional no-op: autoplay rejection is expected before user interaction */
  });
  return video;
};

/**
 * Restore live image handles for *static* image shapes after a scene load.
 *
 * A live `<img>` / `ImageBitmap` in `metadata.image` does not survive
 * serialisation (the serializer drops it) and the shape's `src` is a dead
 * `blob:` URL once the page reloads — so a restored static image has no
 * drawable handle and the renderer skips it (the "dead-blob-url" warning).
 * The bytes still live in `Scene.files` via `fileId`, so decode them back into
 * a live handle and re-attach it to `metadata.image` before the next paint.
 *
 * Async (decode is async) and applied directly to `_scene` with no history
 * entry — a transient runtime handle, not user data. Repaints once when done.
 * Animated shapes are handled by {@link rehydrateAnimatedImages}.
 */
export const rehydrateStaticImages = async (editor: Editor): Promise<void> => {
  const targets: { readonly id: ElementId; readonly data: ArrayBuffer; readonly mime: string }[] =
    [];
  for (const shape of editor._scene.elements.values()) {
    if (!isImage(shape)) continue;
    if (shape.animationKind) continue; // animated path rebuilds via animationData
    if (isDrawableImageSource(shape.metadata?.image)) continue; // freshly inserted — already live
    if (!shape.fileId) continue;
    const file = getBinaryFile(editor._scene, shape.fileId);
    if (!file) {
      // Dangling fileId: the renderer skips this shape silently on the
      // promise of rehydration, so a missing Scene.files entry must be
      // reported here or the blank shape is unexplained.
      console.warn(
        `[state] could not rehydrate image handle: element ${shape.id} points at ` +
          `fileId "${shape.fileId}" but Scene.files has no such entry — ` +
          "the shape will render blank.",
      );
      continue;
    }
    // Generic mime (empty File.type at drop time in older scenes) can't
    // route image-vs-video decoding — recover the real type from the
    // leading magic bytes.
    const mime =
      file.mime === "application/octet-stream"
        ? (sniffBinaryFileMime(file.data) ?? file.mime)
        : file.mime;
    targets.push({ id: shape.id, data: file.data, mime });
  }
  if (targets.length === 0) return;

  let changed = false;
  for (const target of targets) {
    const handle = target.mime.startsWith("video/")
      ? await rehydrateVideoHandle(target.data, target.mime)
      : await decodeImageHandle(target.data, target.mime);
    if (!handle) {
      // Silent skip would leave the shape permanently blank (the renderer's
      // "dead-blob-url" warning with no follow-up) — say why instead.
      console.warn(
        `[state] could not rehydrate image handle from Scene.files ` +
          `(element ${target.id}, mime "${target.mime}", ${target.data.byteLength} bytes) — ` +
          "decode/loadedmetadata failed; the shape will render blank.",
      );
      continue;
    }
    // The scene may have mutated while decoding — re-read the current shape
    // and skip if it vanished or already regained a live handle.
    const shape = editor._scene.elements.get(target.id);
    if (!shape || !isImage(shape)) continue;
    if (isDrawableImageSource(shape.metadata?.image)) continue;
    editor._scene = apply(editor._scene, {
      kind: "element",
      id: shape.id,
      before: shape,
      after: { ...shape, metadata: { ...shape.metadata, image: handle } },
    });
    changed = true;
  }
  if (changed) editor.forceRender();
};
