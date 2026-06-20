/**
 * Public API of `@oh-just-another/editor` — the drop-in diagram editor.
 * Import `<Editor>` and mount.
 *
 * ```tsx
 * import { Editor } from "@oh-just-another/editor";
 *
 * function App() {
 *   return <Editor />;
 * }
 * ```
 *
 * Drive it programmatically via a `ref` — `EditorAPI` exposes curated
 * verbs (mode / selection / undo-redo / zoom / scene) plus `editor`, the
 * full live engine (`EditorInstance` from `@oh-just-another/state`) as the
 * power-user escape hatch. See `EditorProps` for the customisation surface.
 *
 * `Diagram` is a deprecated alias for `Editor`, kept for back-compat.
 */
export {
  Diagram as Editor,
  Diagram,
  type DiagramAPI as EditorAPI,
  type DiagramAPI,
  type DiagramProps as EditorProps,
  type DiagramProps,
  type DiagramTheme as EditorTheme,
  type DiagramTheme,
} from "./Diagram.js";
export {
  detectCapabilities,
  logCapabilities,
  type CapabilityProfile,
  type CapabilityOverrides,
} from "./capabilities.js";
export { isEditableTarget } from "./dom-focus.js";
export { exportSceneToPng, type PngExportBackground, type PngExportOptions } from "./png-export.js";

// Plug-in registries from the underlying packages, surfaced here so the
// umbrella package is the single import for extending the editor without
// reaching into the lower-level packages.
export { registerBounder, registerLayoutKind } from "@oh-just-another/scene";
export { registerElementRenderer, registerAnimationAdapter } from "@oh-just-another/renderer-core";
export { registerMigration } from "@oh-just-another/serialization";

// Peer types that surface in the public API — re-exported so consumers can
// type their plugins, capability overrides, and imperative calls without
// importing the underlying packages directly. The live editor instance
// (state's `Editor`) is re-exported as `EditorInstance` to avoid clashing
// with the `<Editor>` component above.
export type { ElementId } from "@oh-just-another/types";
export type { Editor as EditorInstance, Mode, FileDropHandler } from "@oh-just-another/state";
export type { Scene, LayoutKindEntry } from "@oh-just-another/scene";
export type { Template } from "@oh-just-another/templates";
export type { AnimatedSourceAdapter } from "@oh-just-another/renderer-core";
export type { RendererBackend } from "@oh-just-another/renderer-canvas";
