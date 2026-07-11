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
 * @deprecated `Diagram` — use {@link Editor} instead.
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
export { bindEditorHotkeys, type HotkeyBindingOptions } from "@oh-just-another/state";
export { exportSceneToPng, type PngExportBackground, type PngExportOptions } from "./png-export.js";
// File operations (Save / Open / Export / Copy-as-image) — registered on
// the action registry by `<Editor>`; exported so hosts can wire them to
// their own chrome or a custom registry.
export {
  fileActions,
  registerFileActions,
  setFileActionNotifier,
  downloadScene,
  downloadSvg,
  downloadPng,
  openSceneFile,
  copySceneAsImage,
} from "./file-actions.js";

// Plug-in registries from the underlying packages, surfaced here so the
// umbrella package is the single import for extending the editor without
// reaching into the lower-level packages.
export { registerBounder, registerLayoutKind } from "@oh-just-another/scene";
export { registerElementRenderer, registerAnimationAdapter } from "@oh-just-another/renderer-core";
export { registerInteractiveHitTester, registerRotateAnchor } from "@oh-just-another/state";
export { registerMigration } from "@oh-just-another/serialization";
// `defineShape` — one-call facade over the registries above for adding a
// custom shape type (bounds + render + optional interaction hooks).
export { defineShape, type ShapeSpec, type ShapeRegistration } from "./define-shape.js";
// Built-in GIF decoder — `<Editor>` installs it by default; exported so hosts
// can install it explicitly or opt into it without the component.
export { installGifAnimationAdapter } from "./gif-animation.js";

// Peer types that surface in the public API — re-exported so consumers can
// type their plugins, capability overrides, and imperative calls without
// importing the underlying packages directly. The live editor instance
// (state's `Editor`) is re-exported as `EditorInstance` to avoid clashing
// with the `<Editor>` component above.
export type { ElementId } from "@oh-just-another/types";
export type { Editor as EditorInstance, Mode, FileDropHandler } from "@oh-just-another/state";
// Tool operations + types (eyedropper / convert-type / image-crop / spawn).
export {
  clampCrop,
  computeConvertType,
  computeSetImageCrop,
  computeCommitImageCrop,
  computeSpawnConnectedNode,
  cropFullImageLocalRect,
  cropHandleWorldPoints,
  computeCropHandleDrag,
  computeCropBodyPan,
  CROP_HANDLES,
  FULL_CROP,
  pickColorAt,
} from "@oh-just-another/state";
export type {
  ConvertTarget,
  CropDragResult,
  CropHandle,
  SpawnDirection,
} from "@oh-just-another/state";
export type { ImageCrop } from "@oh-just-another/scene";
export type {
  Scene,
  LayoutKindEntry,
  ElementBase,
  ElementBounder,
  AnchorRef,
} from "@oh-just-another/scene";
export type { ElementRenderer, RenderTarget } from "@oh-just-another/renderer-core";
export type { InteractiveHitTester } from "@oh-just-another/state";
export type { Template } from "@oh-just-another/templates";
export type { AnimatedSourceAdapter } from "@oh-just-another/renderer-core";
export type { RendererBackend } from "@oh-just-another/renderer-canvas";
