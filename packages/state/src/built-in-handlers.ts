import type { Vec2 } from "@oh-just-another/types";
import { DEFAULT_IMAGE_MAX_EDGE_PX } from "./constants.js";
import type { Editor } from "./editor.js";
import {
  isImageFile,
  isVideoFile,
  readFileAsDataURL,
  type FileDropHandler,
} from "./file-drop.js";

/**
 * Read an image data URL and return its natural pixel dimensions
 * (loaded once via an off-screen `<img>` element).
 */
const measureImage = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image() is not available in this environment"));
      return;
    }
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to decode image data URL"));
    img.src = dataUrl;
  });

/**
 * Built-in handler: any file matching IMAGE_MIME_TYPES becomes an
 * ImageShape at the drop point. Measured size is downscaled to
 * `DEFAULT_IMAGE_MAX_EDGE_PX` on the longer axis so huge phone
 * snapshots arrive at a reasonable on-canvas size.
 *
 * Registered automatically by the Editor constructor; hosts that
 * want different sizing can `unregisterFileDropHandler("image")`
 * and supply their own.
 */
export const imageFileDropHandler: FileDropHandler = {
  id: "image",
  accept: (file) => isImageFile(file),
  handle: async (file, { editor, worldPoint }) => {
    // Register the blob in Scene.files first, then create an object-URL
    // for renderer convenience. Scene.json ends up with just a small
    // `fileId` reference instead of the full base64 dataURL, keeping the
    // payload small even for large PNGs.
    //
    // The dataURL fallback path produces a usable `src` for the renderer
    // where `URL.createObjectURL(blob)` is unavailable (headless / SSR):
    // the file is read as a dataURL so the shape still has something to
    // draw if a host renders it before the file blob lands.
    const useObjectUrl =
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
    const fileId = await editor.addBinaryFile(file, file.name);
    const src = useObjectUrl ? URL.createObjectURL(file) : await readFileAsDataURL(file);

    const natural = await measureImage(src);
    const max = DEFAULT_IMAGE_MAX_EDGE_PX;
    const scale =
      Math.max(natural.width, natural.height) > max
        ? max / Math.max(natural.width, natural.height)
        : 1;
    const width = Math.round(natural.width * scale);
    const height = Math.round(natural.height * scale);
    // Land the image centered on the drop point.
    const topLeft: Vec2 = {
      x: worldPoint.x - width / 2,
      y: worldPoint.y - height / 2,
    };
    // Pre-decoded `<img>` instance so the Canvas2D renderer can call
    // drawImage() directly (canvas can't drawImage a raw string). GIFs
    // animate natively in the element — the animation tick re-draws every
    // frame.
    //
    // For animation the `<img>` must be attached to the DOM (Safari won't
    // advance frames on a detached element, and Chrome/Firefox can also
    // pause off-DOM elements). It is attached to a hidden container so the
    // user never sees the raw image element.
    const isGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
    let img: HTMLImageElement | null = null;
    if (typeof Image !== "undefined") {
      img = new Image();
      img.src = src;
      if (typeof document !== "undefined") {
        const sink = ensureAnimatedImageSink();
        img.style.position = "absolute";
        img.style.left = "-99999px";
        img.style.top = "-99999px";
        img.style.width = "1px";
        img.style.height = "1px";
        img.style.opacity = "0";
        img.style.pointerEvents = "none";
        sink.appendChild(img);
      }
      // Wait for the image to decode before handing it to the renderer; an
      // undecoded element draws nothing and the user sees a flash of empty
      // rectangle on first paint.
      if (!img.complete) {
        await new Promise<void>((resolve) => {
          img!.onload = () => resolve();
          img!.onerror = () => resolve();
        });
      }
    }
    editor.insertImage({
      src,
      fileId,
      width,
      height,
      position: topLeft,
      ...(img ? { image: img } : {}),
      animated: isGif,
    });
  },
};

/**
 * Singleton hidden container that holds animated `<img>` elements
 * so the browser keeps decoding their frames. One container per
 * document; created lazily.
 */
const SINK_ID = "oh-just-another-animated-image-sink";

const ensureAnimatedImageSink = (): HTMLElement => {
  const existing = document.getElementById(SINK_ID);
  if (existing) return existing;
  const div = document.createElement("div");
  div.id = SINK_ID;
  div.setAttribute("aria-hidden", "true");
  div.style.position = "absolute";
  div.style.left = "-99999px";
  div.style.top = "-99999px";
  div.style.pointerEvents = "none";
  document.body.appendChild(div);
  return div;
};

/**
 * Built-in video file-drop handler. Drops a `<video>` element into
 * the hidden sink (autoplay + muted + loop so it advances frames
 * without user-gesture limits), reads the natural dimensions, and
 * inserts an image-shaped scene element pointing at the video
 * element via `metadata.image`. The Canvas2D renderer accepts a
 * video element through drawImage and reads its current frame.
 * The editor's animation tick (`metadata.animated = true`) keeps
 * the canvas in sync with the playing video.
 */
export const videoFileDropHandler: FileDropHandler = {
  id: "video",
  accept: (file) => isVideoFile(file),
  handle: async (file, { editor, worldPoint }) => {
    if (typeof document === "undefined") return;
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    const sink = ensureAnimatedImageSink();
    video.style.position = "absolute";
    video.style.left = "-99999px";
    video.style.top = "-99999px";
    video.style.width = "1px";
    video.style.height = "1px";
    sink.appendChild(video);
    await new Promise<void>((resolve) => {
      const done = (): void => resolve();
      video.onloadedmetadata = done;
      video.onerror = done;
    });
    const nW = video.videoWidth || 480;
    const nH = video.videoHeight || 270;
    const max = DEFAULT_IMAGE_MAX_EDGE_PX;
    const scale = Math.max(nW, nH) > max ? max / Math.max(nW, nH) : 1;
    const width = Math.round(nW * scale);
    const height = Math.round(nH * scale);
    const topLeft: Vec2 = {
      x: worldPoint.x - width / 2,
      y: worldPoint.y - height / 2,
    };
    // Best-effort play (some browsers require an interaction
    // before allowing autoplay even when muted).
    void video.play().catch(() => {});
    editor.insertImage({
      src: url,
      width,
      height,
      position: topLeft,
      image: video as unknown as HTMLImageElement,
      animated: true,
    });
  },
};
