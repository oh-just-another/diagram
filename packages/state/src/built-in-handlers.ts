import type { Vec2 } from "@oh-just-another/types";
import type { Editor } from "./editor.js";
import {
  isImageFile,
  readFileAsDataURL,
  type FileDropHandler,
} from "./file-drop.js";

/**
 * Default max edge length for a freshly-inserted image. Larger
 * images are downscaled to fit inside this box on the longer axis;
 * aspect ratio is preserved. Keeps a 4000×3000 phone snapshot from
 * dropping in at viewport-eating size.
 */
const DEFAULT_IMAGE_MAX_EDGE_PX = 480;

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
    const img =
      typeof Image !== "undefined"
        ? Object.assign(new Image(), { src: dataUrl })
        : null;
    const isGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
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
