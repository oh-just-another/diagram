import type { Vec2 } from "@oh-just-another/types";
import { DEFAULT_IMAGE_MAX_EDGE_PX } from "./constants.js";
import type { Editor } from "./editor.js";
import {
  isImageFile,
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
    const dataUrl = await readFileAsDataURL(file);
    const natural = await measureImage(dataUrl);
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
      img.src = dataUrl;
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
      src: dataUrl,
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
