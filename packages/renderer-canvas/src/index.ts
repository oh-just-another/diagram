export { Canvas2DTarget } from "./canvas-target.js";
export { setupHiDpi } from "./hi-dpi.js";
export { LayeredCanvas, type LayeredCanvasOptions } from "./layered-canvas.js";

// `installBuiltinRenderers` and `wrapText` live in
// `@oh-just-another/renderer-core` so the SVG / headless backends can share them.
// These re-exports keep existing imports working.
export { installBuiltinRenderers, wrapText } from "@oh-just-another/renderer-core";
export type { WrapOptions, WrappedLine } from "@oh-just-another/renderer-core";

// `installBuiltinRenderers()` must be called once before `renderScene`
// from `@oh-just-another/renderer-core` knows how to draw built-in shapes. It is
// not auto-invoked so that this package stays `sideEffects: false` and tree-
// shakeable. Hosts typically call it in their entry file.
