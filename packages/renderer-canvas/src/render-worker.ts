/// <reference lib="webworker" />
import { installBuiltinRenderers, renderScene } from "@oh-just-another/renderer-core";
import type { Scene } from "@oh-just-another/scene";
import type {
  WorkerRenderMessage,
  WorkerRenderResponse,
} from "@oh-just-another/renderer-core";
import { Canvas2DTarget } from "./canvas-target.js";
import { replayCommands, type RenderCommand } from "./recording-target.js";

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
}

const state: WorkerState = { canvas: null, target: null, dpr: 1 };

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
  state.target = new Canvas2DTarget(
    ctx as unknown as CanvasRenderingContext2D,
    width,
    height,
    dpr,
  );
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
 * Replay a serialised RecordingTarget command stream onto the owned
 * OffscreenCanvas. Used by the LayeredSurface "offscreen" backend: the
 * main thread captures every RenderTarget call into a buffer and ships
 * it here per frame; the worker replays.
 */
const replay = (commands: readonly RenderCommand[]): void => {
  if (!state.target) {
    post({ type: "error", message: "Worker not initialised" });
    return;
  }
  replayCommands(state.target, commands);
};

interface ReplayMessage { readonly type: "replay"; readonly commands: readonly RenderCommand[] }
type InboundMessage = WorkerRenderMessage | ReplayMessage;

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
          replay(msg.commands);
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
