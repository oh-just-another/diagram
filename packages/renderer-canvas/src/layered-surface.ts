import { LAYER_ORDER, type LayerName, type RenderTarget } from "@oh-just-another/renderer-core";
import { LayeredCanvas } from "./layered-canvas.js";
import { WebGL2Target } from "./webgl2-target.js";
import { RecordingTarget } from "./recording-target.js";
import { setupHiDpiNoContext } from "./hi-dpi.js";

/**
 * Backend selector for `createLayeredSurface`.
 *
 *   - `canvas2d`   per-layer `Canvas2DTarget` over stacked DOM canvases.
 *   - `webgl2`     per-layer `WebGL2Target` over stacked DOM canvases
 *                  (each with its own WebGL2 context).
 *   - `offscreen`  per-layer `RecordingTarget` on the main thread,
 *                  forwarded into a dedicated worker per layer that
 *                  owns the transferred OffscreenCanvas and replays
 *                  the buffered command stream.
 */
export type RendererBackend = "canvas2d" | "webgl2" | "offscreen";

/**
 * Common interface every backend's surface exposes. The Editor reaches
 * each layer's `RenderTarget` via `get(name)`; the host calls
 * `present()` after each frame so backends with deferred submission
 * (offscreen) can ship their buffered commands to workers. Synchronous
 * backends (`canvas2d`, `webgl2`) implement `present` as a no-op.
 */
export interface LayeredSurface {
  readonly backend: RendererBackend;
  get(name: LayerName): RenderTarget;
  getCanvas(name: LayerName): HTMLCanvasElement;
  resize(width: number, height: number): void;
  readonly size: { readonly width: number; readonly height: number };
  /** Hook called once per frame after the Editor finishes drawing. */
  present(): void;
  dispose(): void;
}

export interface CreateLayeredSurfaceOptions {
  readonly backend?: RendererBackend;
  /**
   * Override the worker factory used by the `offscreen` backend.
   * Hosts pass a Vite-aware factory:
   *
   *   new Worker(new URL("@oh-just-another/renderer-canvas/render-worker",
   *                       import.meta.url), { type: "module" })
   *
   * because `import.meta.url` resolution depends on the bundler.
   * When missing, the offscreen backend throws on construction (there
   * is no sensible cross-bundler default).
   */
  readonly workerFactory?: () => Worker;
}

/**
 * Factory entry point. Picks the right backend implementation, builds
 * it, and returns the common `LayeredSurface` interface. Canvas2D is
 * always safe; WebGL2 throws if the browser doesn't expose
 * `getContext("webgl2")`; Offscreen throws if either `OffscreenCanvas`
 * or `transferControlToOffscreen` is missing.
 *
 * The host (DiagramRoot) catches errors and falls back to `canvas2d`
 * automatically when an opt-in backend isn't supported.
 */
export const createLayeredSurface = (
  host: HTMLElement,
  width: number,
  height: number,
  options: CreateLayeredSurfaceOptions = {},
): LayeredSurface => {
  const backend = options.backend ?? "canvas2d";
  switch (backend) {
    case "canvas2d":
      return new Canvas2DLayeredSurface(host, width, height);
    case "webgl2":
      return new WebGL2LayeredSurface(host, width, height);
    case "offscreen":
      if (!options.workerFactory) {
        throw new Error(
          "createLayeredSurface: workerFactory is required for the offscreen backend",
        );
      }
      return new OffscreenLayeredSurface(host, width, height, options.workerFactory);
  }
};

/**
 * Build the requested surface and fall back to `canvas2d` if the
 * opt-in backend throws (no WebGL2 / no OffscreenCanvas / per-page
 * WebGL context limit hit). On fallback, `onFallback` is invoked
 * with the original error so the host can surface a toast / log.
 *
 * Use this when the backend is user-controlled (demo dropdown,
 * URL param) so a misclick doesn't crash the React tree. Hosts
 * that want hard failures should call `createLayeredSurface`
 * directly and handle the throw themselves.
 */
export const createLayeredSurfaceWithFallback = (
  host: HTMLElement,
  width: number,
  height: number,
  options: CreateLayeredSurfaceOptions = {},
  onFallback?: (backend: RendererBackend, error: unknown) => void,
): { surface: LayeredSurface; effectiveBackend: RendererBackend } => {
  const requested = options.backend ?? "canvas2d";
  try {
    return {
      surface: createLayeredSurface(host, width, height, options),
      effectiveBackend: requested,
    };
  } catch (err) {
    if (requested === "canvas2d") throw err;
    onFallback?.(requested, err);
    return {
      surface: createLayeredSurface(host, width, height, { ...options, backend: "canvas2d" }),
      effectiveBackend: "canvas2d",
    };
  }
};

/** Canvas2D surface — wraps `LayeredCanvas` (3× Canvas2DTarget). */
class Canvas2DLayeredSurface implements LayeredSurface {
  readonly backend = "canvas2d" as const;
  private readonly inner: LayeredCanvas;

  constructor(host: HTMLElement, width: number, height: number) {
    this.inner = new LayeredCanvas(host, width, height);
  }

  get(name: LayerName): RenderTarget {
    return this.inner.get(name);
  }
  getCanvas(name: LayerName): HTMLCanvasElement {
    return this.inner.getCanvas(name);
  }
  resize(width: number, height: number): void {
    this.inner.resize(width, height);
  }
  get size(): { readonly width: number; readonly height: number } {
    return this.inner.size;
  }
  present(): void {
    // No-op — Canvas2D paints synchronously.
  }
  dispose(): void {
    this.inner.dispose();
  }
}

/**
 * WebGL2 surface — hybrid: GPU only for the heavy `main` layer;
 * `overlay` / `background` stay on Canvas2D.
 *
 * Overlay paints handles / selection halo / port hints — a few dozen
 * primitives per frame, trivially fast in Canvas2D. Background paints
 * the grid — a repeating rect, also Canvas2D-cheap. Giving each its own
 * WebGL2 context would triple GL state churn, triple GPU memory, and
 * triple the chance of hitting the browser's per-page WebGL context cap
 * (~16 in Chrome).
 */
class WebGL2LayeredSurface implements LayeredSurface {
  readonly backend = "webgl2" as const;
  /** Canvas2D layered for overlay + background. */
  private readonly base: LayeredCanvas;
  /** WebGL2 only for `main`. */
  private readonly mainCanvas: HTMLCanvasElement;
  private readonly mainTarget: WebGL2Target;
  private _width: number;
  private _height: number;

  constructor(host: HTMLElement, width: number, height: number) {
    this._width = width;
    this._height = height;
    // Build the Canvas2D layers first; the WebGL2 main canvas is
    // spliced into the same stack between background and overlay.
    this.base = new LayeredCanvas(host, width, height, {
      layers: LAYER_ORDER.filter((name): name is "overlay" | "background" => name !== "main"),
    });

    const overlay = this.base.getCanvas("overlay");
    const canvas = host.ownerDocument.createElement("canvas");
    canvas.dataset.layer = "main";
    canvas.dataset.backend = "webgl2";
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    // Insert main before overlay so overlay sits on top in z-order.
    host.insertBefore(canvas, overlay);
    // Never call `getContext("2d")` on this canvas: the WebGL2 slot is
    // exclusive — one canvas, one context kind, for the life of the
    // element. `setupHiDpiNoContext` sizes the bitmap without touching
    // the context.
    setupHiDpiNoContext(canvas, width, height);
    try {
      this.mainCanvas = canvas;
      this.mainTarget = new WebGL2Target(canvas, width, height);
    } catch (err) {
      canvas.remove();
      this.base.dispose();
      throw err;
    }
  }

  get(name: LayerName): RenderTarget {
    if (name === "main") return this.mainTarget;
    return this.base.get(name);
  }
  getCanvas(name: LayerName): HTMLCanvasElement {
    if (name === "main") return this.mainCanvas;
    return this.base.getCanvas(name);
  }
  resize(width: number, height: number): void {
    if (this._width === width && this._height === height) return;
    this._width = width;
    this._height = height;
    this.base.resize(width, height);
    setupHiDpiNoContext(this.mainCanvas, width, height);
    this.mainTarget.resize(width, height);
  }
  get size(): { readonly width: number; readonly height: number } {
    return { width: this._width, height: this._height };
  }
  present(): void {
    // Canvas2D + WebGL2 both paint synchronously — nothing to flush.
  }
  dispose(): void {
    this.mainTarget.dispose();
    this.mainCanvas.remove();
    this.base.dispose();
  }
}

/**
 * Offscreen surface — main-thread `RecordingTarget` per layer + a
 * dedicated worker per layer that owns the transferred OffscreenCanvas
 * and replays the buffered command stream on each `present()`.
 *
 * Trade-offs:
 *   • Latency: every `present()` posts one message per layer; on
 *     desktop browsers this is sub-millisecond, but interactive
 *     overlay (pointer-following handles) sees one rAF of delay
 *     because the worker draws after the main thread yields.
 *   • Memory: 3× workers, each owning a DPR-sized OffscreenCanvas.
 *   • drawImage is silently skipped — see `RecordingTarget` docs.
 */
class OffscreenLayeredSurface implements LayeredSurface {
  readonly backend = "offscreen" as const;
  private readonly canvases = new Map<LayerName, HTMLCanvasElement>();
  private readonly targets = new Map<LayerName, RecordingTarget>();
  private readonly workers = new Map<LayerName, Worker>();
  private _width: number;
  private _height: number;
  private readonly dpr: number;

  constructor(host: HTMLElement, width: number, height: number, workerFactory: () => Worker) {
    this._width = width;
    this._height = height;
    this.dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }

    try {
      for (const name of LAYER_ORDER) {
        const canvas = host.ownerDocument.createElement("canvas");
        canvas.dataset.layer = name;
        canvas.dataset.backend = "offscreen";
        canvas.style.position = "absolute";
        canvas.style.inset = "0";
        canvas.style.pointerEvents = name === "overlay" ? "auto" : "none";
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        host.appendChild(canvas);

        const worker = workerFactory();
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage({ type: "init", canvas: offscreen, width, height, dpr: this.dpr }, [
          offscreen,
        ]);

        this.canvases.set(name, canvas);
        this.workers.set(name, worker);
        this.targets.set(name, new RecordingTarget(width, height));
      }
    } catch (err) {
      this.dispose();
      throw err;
    }
  }

  get(name: LayerName): RenderTarget {
    const t = this.targets.get(name);
    if (!t) throw new Error(`Layer not created: ${name}`);
    return t;
  }
  getCanvas(name: LayerName): HTMLCanvasElement {
    const c = this.canvases.get(name);
    if (!c) throw new Error(`Layer not created: ${name}`);
    return c;
  }
  resize(width: number, height: number): void {
    if (this._width === width && this._height === height) return;
    this._width = width;
    this._height = height;
    for (const [name, canvas] of this.canvases) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      this.targets.get(name)?.resize(width, height);
      this.workers.get(name)?.postMessage({ type: "resize", width, height });
    }
  }
  get size(): { readonly width: number; readonly height: number } {
    return { width: this._width, height: this._height };
  }
  present(): void {
    for (const [name, target] of this.targets) {
      const cmds = target.flush();
      if (cmds.length === 0) continue;
      this.workers.get(name)?.postMessage({ type: "replay", commands: cmds });
    }
  }
  dispose(): void {
    for (const worker of this.workers.values()) worker.terminate();
    for (const canvas of this.canvases.values()) canvas.remove();
    this.workers.clear();
    this.canvases.clear();
    this.targets.clear();
  }
}
