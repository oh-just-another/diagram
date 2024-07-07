export { Canvas2DTarget } from "./canvas-target";
export { setupHiDpi } from "./hi-dpi";
export { LayeredCanvas, type LayeredCanvasOptions } from "./layered-canvas";
export { wrapText, type WrapOptions, type WrappedLine } from "./text-layout";
export { installBuiltinRenderers } from "./built-in-renderers";

// `installBuiltinRenderers()` must be called once before `renderScene`
// from `@oh-just-another/renderer-core` knows how to draw built-in shapes. It is
// not auto-invoked so that this package stays `sideEffects: false` and tree-
// shakeable. Hosts typically call it in their entry file.
