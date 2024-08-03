// Minimal CanvasRenderingContext2D stub so jsdom can host the editor without
// pulling the heavyweight `canvas` npm package. Every method we use returns a
// stable fake value; we only need it to *exist*, not to actually paint.

const buildStubContext = (canvas: HTMLCanvasElement): unknown =>
  new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "canvas") return canvas;
        if (prop === "measureText") return () => ({ width: 0 });
        if (prop === "getTransform") {
          return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true, isIdentity: true });
        }
        return (): undefined => undefined;
      },
    },
  );

// @ts-expect-error -- patching prototype on the jsdom-provided implementation
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
  return buildStubContext(this);
};

// jsdom ships no PointerEvent or pointer-capture APIs; the editor uses both.
const noopCapture = (): undefined => undefined;
Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  value: noopCapture,
  writable: true,
});
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  value: noopCapture,
  writable: true,
});
Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  value: () => false,
  writable: true,
});

// jsdom ResizeObserver is absent — stub with a no-op.
if (typeof globalThis.ResizeObserver === "undefined") {
  class StubResizeObserver {
    observe(): undefined {
      return undefined;
    }
    unobserve(): undefined {
      return undefined;
    }
    disconnect(): undefined {
      return undefined;
    }
  }
  (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
    StubResizeObserver;
}
