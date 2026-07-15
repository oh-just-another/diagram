/// <reference lib="webworker" />
import { LruCache, installBuiltinRenderers, renderScene } from "@oh-just-another/renderer-core";
import type { Scene } from "@oh-just-another/scene";
import type { WorkerRenderMessage, WorkerRenderResponse } from "@oh-just-another/renderer-core";
import { registerBundledFonts, type FontScope } from "@oh-just-another/fonts";
import { Canvas2DTarget } from "./canvas-target.js";
import { replayPackedFrame, type PackedReplayMessage } from "./replay-codec.js";
import { OFFSCREEN_IMAGE_CACHE_CAP } from "./constants.js";

/**
 * OffscreenCanvas render worker.
 *
 * Hosts spawn this with `new Worker(new URL("./render-worker.ts",
 * import.meta.url), { type: "module" })`. The main thread transfers a
 * canvas via `transferCanvasToWorker(canvas, worker, { width, height,
 * dpr })`, then posts `snapshot` messages with full scenes.
 *
 * One worker owns one OffscreenCanvas — typically one per layer in a
 * `LayerWorkerPool`, so layers can be rasterised in parallel and then
 * composited on the main thread.
 */

interface WorkerState {
  canvas: OffscreenCanvas | null;
  target: Canvas2DTarget | null;
  dpr: number;
  /**
   * Bitmaps shipped by the main thread's RecordingTarget, keyed by the
   * id it assigned. Persists across `replay` messages and mirrors the
   * recorder's same-capacity LRU. Evicted clones are closed to release
   * their memory promptly (these are worker-owned copies, distinct from
   * the main thread's source bitmaps).
   */
  readonly images: LruCache<number, ImageBitmap>;
}

const state: WorkerState = {
  canvas: null,
  target: null,
  dpr: 1,
  images: new LruCache<number, ImageBitmap>(OFFSCREEN_IMAGE_CACHE_CAP, (_id, bitmap) => {
    bitmap.close();
  }),
};

let renderersInstalled = false;

const ensureRenderers = (): void => {
  if (renderersInstalled) return;
  installBuiltinRenderers();
  renderersInstalled = true;
};

const post = (msg: WorkerRenderResponse, transfer?: Transferable[]): void => {
  if (transfer && transfer.length > 0) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
  } else {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
  }
};

const init = (canvas: OffscreenCanvas, width: number, height: number, dpr: number): void => {
  // Load the bundled fonts into the worker's font set so its Canvas2D target
  // draws the same faces as the main thread. Fire-and-forget — replays after
  // it resolves pick up the loaded fonts.
  void registerBundledFonts(self as unknown as FontScope);
  state.canvas = canvas;
  state.dpr = dpr;
  // Resize the bitmap to dpr-scaled pixels — the host's CSS size is
  // (width, height); render into the bigger buffer and let the
  // composite step downsample as needed.
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.target = new Canvas2DTarget(ctx as unknown as CanvasRenderingContext2D, width, height, dpr);
  post({ type: "ready" });
};

const resize = (width: number, height: number): void => {
  if (!state.canvas || !state.target) return;
  state.canvas.width = Math.max(1, Math.round(width * state.dpr));
  state.canvas.height = Math.max(1, Math.round(height * state.dpr));
  const ctx = state.canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  state.target.resize(width, height, state.dpr);
};

const snapshot = (scene: Scene): void => {
  if (!state.canvas || !state.target) {
    post({ type: "error", message: "Worker not initialised" });
    return;
  }
  ensureRenderers();
  const ctx = state.canvas.getContext("2d");
  if (ctx === null) {
    post({ type: "error", message: "Worker not initialised" });
    return;
  }
  ctx.save();
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.clearRect(0, 0, state.target.size.width, state.target.size.height);
  renderScene(scene, state.target);
  ctx.restore();
  const bitmap = state.canvas.transferToImageBitmap();
  post({ type: "frame-done", bitmap }, [bitmap]);
};

/**
 * Replay a packed RecordingTarget command stream onto the owned
 * OffscreenCanvas. Used by the LayeredSurface "offscreen" backend: the
 * main thread captures every RenderTarget call into a buffer, packs it
 * via `packReplayFrame`, and ships it here per frame (numeric stream in
 * the transfer list, bitmaps cloned alongside); the worker replays.
 */
const replay = (msg: PackedReplayMessage): void => {
  if (!state.target) {
    post({ type: "error", message: "Worker not initialised" });
    return;
  }
  // Register this frame's bitmaps BEFORE replaying so the stream's
  // drawImage id references resolve. These are worker-owned clones —
  // the LRU's evict hook closes them.
  for (const { id, bitmap } of msg.bitmaps) {
    // A re-defined id (re-captured video frame) replaces the stored clone;
    // close the old one — LruCache.set does not fire onEvict on overwrite.
    const prev = state.images.get(id);
    if (prev && prev !== bitmap) prev.close();
    state.images.set(id, bitmap);
  }
  replayPackedFrame(state.target, msg.buffer, msg.strings, state.images);
};

type InboundMessage = WorkerRenderMessage | PackedReplayMessage;

(self as unknown as DedicatedWorkerGlobalScope).addEventListener(
  "message",
  (ev: MessageEvent<InboundMessage>) => {
    const msg = ev.data;
    try {
      switch (msg.type) {
        case "init":
          init(msg.canvas as OffscreenCanvas, msg.width, msg.height, msg.dpr);
          break;
        case "resize":
          resize(msg.width, msg.height);
          break;
        case "snapshot":
          // A dpr update only takes effect on the next resize; snapshot
          // honours whatever transform init established.
          snapshot(msg.scene);
          break;
        case "replay":
          replay(msg);
          break;
        case "frame":
          // Patch-stream frames are not implemented; the protocol is
          // reserved. Reply with an error so callers don't hang on the
          // awaited response.
          post({ type: "error", message: "patch-stream frames not implemented" });
          break;
      }
    } catch (err) {
      post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
);
