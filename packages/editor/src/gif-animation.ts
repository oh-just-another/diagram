import type { ParsedFrame } from "gifuct-js";
import {
  registerAnimationAdapter,
  notifyAnimationContentReady,
  type AnimatedSourceAdapter,
} from "@oh-just-another/renderer-core";
import { DEFAULT_FRAME_DELAY_MS } from "./constants.js";

/**
 * Built-in GIF animation adapter. The kernel ships only the
 * `AnimatedSourceAdapter` registry + the stateless "what does this frame look
 * like at time T?" question; the actual GIF decode lives here, behind a LAZY
 * `gifuct-js` import — the decoder is only fetched (its own async chunk) the
 * first time a GIF is actually decoded, so apps that never show a GIF never
 * pay for it.
 *
 * A hidden `<img>` is not used: browsers pause GIF frame advancement for
 * near-invisible / off-screen elements, so a 1px-opacity-0.01 sink never
 * animates reliably. Decoding frames here and selecting by timestamp works
 * identically for Canvas2D and WebGL2 — the renderer just gets an `ImageBitmap`
 * of the current frame.
 *
 * `animationData` carried by the shape is the raw GIF `ArrayBuffer` (the same
 * bytes stored in `Scene.files`). Decode is async, so `getFrameAt` kicks off a
 * one-time decode and returns `null` until it's ready — the renderer skips a
 * null handle and the `AnimationTick` re-render picks up the frames once
 * decoded. Decoded results are cached per `ArrayBuffer` identity.
 */

interface DecodedFrame {
  readonly bitmap: ImageBitmap;
  /** Cumulative end time of this frame in ms. */
  readonly endMs: number;
}

interface DecodedGif {
  readonly frames: readonly DecodedFrame[];
  readonly totalMs: number;
}

const decodeCache = new WeakMap<object, DecodedGif>();
const decoding = new WeakSet();

const compositeGifFrames = async (buffer: ArrayBuffer): Promise<DecodedGif> => {
  // Lazy-load the decoder — only fetched when a GIF is first decoded.
  const { parseGIF, decompressFrames } = await import("gifuct-js");
  const gif = parseGIF(buffer);
  const raw: ParsedFrame[] = decompressFrames(gif, true);
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  if (width <= 0 || height <= 0 || raw.length === 0) {
    return { frames: [], totalMs: 0 };
  }

  // Persistent composite — each frame's patch is drawn on top so partial-frame
  // GIFs (most of them) accumulate correctly. Disposal type 2 ("restore to
  // background") clears the patch region after snapshotting; types 1/0 keep it
  // (the common case).
  const composite = new OffscreenCanvas(width, height);
  const cctx = composite.getContext("2d");
  const patch = new OffscreenCanvas(width, height);
  const pctx = patch.getContext("2d");
  if (!cctx || !pctx) return { frames: [], totalMs: 0 };

  const frames: DecodedFrame[] = [];
  let cumulative = 0;
  for (const fr of raw) {
    // Copy into a fresh ArrayBuffer-backed array — gifuct's patch may be typed
    // as `Uint8ClampedArray<ArrayBufferLike>` (SharedArrayBuffer union), which
    // `ImageData` doesn't accept under TS's strict ArrayBuffer typing.
    const imageData = new ImageData(new Uint8ClampedArray(fr.patch), fr.dims.width, fr.dims.height);
    patch.width = fr.dims.width;
    patch.height = fr.dims.height;
    pctx.putImageData(imageData, 0, 0);
    cctx.drawImage(patch, fr.dims.left, fr.dims.top);
    // Snapshot the full composite as this frame.
    const bitmap = await createImageBitmap(composite);
    cumulative += fr.delay > 0 ? fr.delay : DEFAULT_FRAME_DELAY_MS;
    frames.push({ bitmap, endMs: cumulative });
    if (fr.disposalType === 2) {
      cctx.clearRect(fr.dims.left, fr.dims.top, fr.dims.width, fr.dims.height);
    }
  }
  return { frames, totalMs: cumulative };
};

const gifAdapter: AnimatedSourceAdapter<ArrayBuffer> = {
  kind: "gif",
  getFrameAt(data, timestampMs) {
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0) return null;
    const decoded = decodeCache.get(data);
    if (!decoded) {
      // First sighting — kick off a one-time async decode. Return null
      // meanwhile; the renderer skips a null handle and the next AnimationTick
      // frame will find the cache populated.
      if (!decoding.has(data)) {
        decoding.add(data);
        compositeGifFrames(data)
          .then((d) => {
            decodeCache.set(data, d);
            // Nudge the host to render once more so a paused shape
            // (reduced-motion / auto-stopped / frozen) — which has no animation
            // tick to pick the frames up — paints its now-decoded frame.
            notifyAnimationContentReady();
          })
          .catch(() => {
            /* leave uncached — getFrameAt keeps returning null */
          })
          .finally(() => decoding.delete(data));
      }
      return null;
    }
    if (decoded.frames.length === 0) return null;
    const t = decoded.totalMs > 0 ? timestampMs % decoded.totalMs : 0;
    for (const frame of decoded.frames) {
      if (t < frame.endMs) return frame.bitmap;
    }
    const last = decoded.frames[decoded.frames.length - 1];
    return last ? last.bitmap : null;
  },
  totalDurationMs(data) {
    return decodeCache.get(data)?.totalMs ?? 0;
  },
};

let installed = false;

/**
 * Register the built-in GIF animation adapter once. Idempotent — `<Editor>`
 * calls this by default on mount, but hosts can also call it explicitly (or
 * register their own `kind: "gif"` adapter to override it).
 */
export const installGifAnimationAdapter = (): void => {
  if (installed) return;
  installed = true;
  registerAnimationAdapter(gifAdapter);
};
