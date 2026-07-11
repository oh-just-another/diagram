export { DiagramComponent } from "./Diagram.js";

// Re-export the shared prop / event / controller types so Angular hosts get
// the full typed surface from a single import.
export type {
  DiagramRenderer,
  DiagramTheme,
  OjaDiagramController,
  OjaDiagramEventMap,
  OjaDiagramProps,
} from "@oh-just-another/diagram";
