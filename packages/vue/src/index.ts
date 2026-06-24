export { OhDiagram, default } from "./OhDiagram.js";

// Re-export the shared prop / event / controller types so Vue hosts get the
// full typed surface from a single import.
export type {
  DiagramRenderer,
  DiagramTheme,
  OhDiagramController,
  OhDiagramEventMap,
  OhDiagramProps,
} from "@oh-just-another/element";
