import { LAYER_ORDER, type LayerName } from "@oh-just-another/renderer-core";
import { Canvas2DTarget } from "./canvas-target.js";
import { setupHiDpi } from "./hi-dpi.js";

export interface LayeredCanvasOptions {
  /** Subset of layers to create. Defaults to all three. */
  readonly layers?: readonly LayerName[];
  /** Override `window.devicePixelRatio`. */
  readonly dpr?: number;
}

/**
 * Manages one stacked `<canvas>` per layer. The background canvas sits at the
 * bottom of the DOM stack and the overlay at the top, so drawing onto `main`
 * never invalidates the static `background`. Each layer is a `Canvas2DTarget`
 * with its own CSS-pixel coordinate space.
 *
 * The host element gets `position: relative` so absolute children stack on top
 * of each other; each canvas is `position: absolute, inset: 0`.
 */
export class LayeredCanvas {
  private readonly host: HTMLElement;
  private readonly layers: ReadonlyMap<LayerName, Canvas2DTarget>;
  private readonly canvases: ReadonlyMap<LayerName, HTMLCanvasElement>;
  private width: number;
  private height: number;
  private dprOverride: number | undefined;

  constructor(
    host: HTMLElement,
    width: number,
    height: number,
    options: LayeredCanvasOptions = {},
  ) {
    this.host = host;
    this.width = width;
    this.height = height;
    this.dprOverride = options.dpr;

    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }

    const requested = options.layers ?? LAYER_ORDER;
    const layers = new Map<LayerName, Canvas2DTarget>();
    const canvases = new Map<LayerName, HTMLCanvasElement>();

    for (const name of LAYER_ORDER) {
      if (!requested.includes(name)) continue;
      const canvas = host.ownerDocument.createElement("canvas");
      canvas.dataset.layer = name;
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      canvas.style.pointerEvents = name === "overlay" ? "auto" : "none";
      host.appendChild(canvas);
      const dpr = setupHiDpi(canvas, width, height, this.dprOverride);
      void dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to obtain 2D context");
      layers.set(name, new Canvas2DTarget(ctx, width, height));
      canvases.set(name, canvas);
    }

    this.layers = layers;
    this.canvases = canvases;
  }

  /** Get the target for a layer. Throws if the layer was not created. */
  get(name: LayerName): Canvas2DTarget {
    const target = this.layers.get(name);
    if (!target) throw new Error(`Layer not created: ${name}`);
    return target;
  }

  /** Get the underlying `<canvas>` element for a layer. */
  getCanvas(name: LayerName): HTMLCanvasElement {
    const canvas = this.canvases.get(name);
    if (!canvas) throw new Error(`Layer not created: ${name}`);
    return canvas;
  }

  /** Resize every canvas in the stack to the new CSS-pixel size. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    for (const [name, canvas] of this.canvases) {
      setupHiDpi(canvas, width, height, this.dprOverride);
      this.layers.get(name)!.resize(width, height);
    }
  }

  get size(): { readonly width: number; readonly height: number } {
    return { width: this.width, height: this.height };
  }

  /** Detach all canvases from the host. After this the instance is unusable. */
  dispose(): void {
    for (const canvas of this.canvases.values()) {
      canvas.remove();
    }
  }
}
