import type { ElementId } from "@oh-just-another/types";
import { bounds as B } from "@oh-just-another/math";
import { apply, getBinaryFile, getElementWorldBounds, isImage } from "@oh-just-another/scene";
import { HEAVY_GIF_BYTES } from "../constants.js";
import { hasAnimatedElement } from "./public/image-insert.js";
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
