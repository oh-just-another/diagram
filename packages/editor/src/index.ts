/**
 * Public API of `@oh-just-another/editor` — the drop-in diagram editor.
 * Import `<Diagram>` and mount.
 *
 * ```tsx
 * import { Diagram } from "@oh-just-another/editor";
 *
 * function App() {
 *   return <Diagram />;
 * }
 * ```
 *
 * See `DiagramProps` for the customisation surface: plugins, chrome
 * on/off flags, slot renderers, imperative `apiRef`, capability
 * overrides, theme.
 */
export { Diagram, type DiagramAPI, type DiagramProps } from "./Diagram.js";
export {
  detectCapabilities,
  logCapabilities,
  type CapabilityProfile,
  type CapabilityOverrides,
} from "./capabilities.js";
export { isEditableTarget } from "./dom-focus.js";
