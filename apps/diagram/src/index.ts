/**
 * Public API of `@oh-just-another/diagram` — the library-shaped
 * diagram editor. Import `<Diagram>` and mount.
 *
 * ```tsx
 * import { Diagram } from "@oh-just-another/diagram";
 *
 * function App() {
 *   return <Diagram />;
 * }
 * ```
 *
 * See `DiagramProps` for the customisation surface: plugins,
 * chrome on/off flags, slot renderers, imperative `apiRef`,
 * capability overrides, theme.
 */
export { Diagram, type DiagramAPI, type DiagramProps } from "./Diagram.js";
export {
  detectCapabilities,
  logCapabilities,
  type CapabilityProfile,
  type CapabilityOverrides,
} from "./capabilities.js";
