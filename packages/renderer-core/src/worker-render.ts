import type { Bounds } from "@oh-just-another/types";
import type { Scene } from "@oh-just-another/scene";

/**
 * Worker-backed renderer protocol (+ 49). Defines the
 * postMessage contract between the main-thread orchestrator and
 * an OffscreenCanvas worker that owns a layer of the scene.
 *
 * Implementations live in `@oh-just-another/renderer-workers` (future).
 * Wired up via `EditorOptions.workers` per backend:
 *
 *  workers: {
 *   canvas2d: true,     // OffscreenCanvas in worker
 *   webgl: false,
 *   textShaper: true,    // shared text-shaper worker
 *  }
 */

export type WorkerRenderMessage =
 | {
   readonly type: "init";
   /** Transferred canvas. */
   readonly canvas: unknown;
   readonly width: number;
   readonly height: number;
   readonly dpr: number;
  }
 | { readonly type: "resize"; readonly width: number; readonly height: number }
 | {
   readonly type: "frame";
   /** Serialised scene patches applied since the last frame. */
   readonly patches: readonly unknown[];
   /** World-space dirty rect; main re-uses this when compositing. */
   readonly dirtyWorld?: Bounds;
  }
 | { readonly type: "snapshot"; readonly scene: Scene; readonly dpr: number };

export type WorkerRenderResponse =
 | { readonly type: "ready" }
 | {
   readonly type: "frame-done";
   /** ImageBitmap of the rendered layer, transferable. */
   readonly bitmap: unknown;
   readonly dirtyWorld?: Bounds;
  }
 | { readonly type: "error"; readonly message: string };

/**
 * Auto-enable threshold — when the scene crosses this size and the
 * host opted into workers, the editor moves the main canvas to a
 * worker. Below the threshold, in-thread rendering is cheaper than
 * the postMessage overhead.
 */
export const WORKER_AUTO_THRESHOLD = 5_000;
