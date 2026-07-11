import type { Scene } from "@oh-just-another/scene";
import { parseMermaid } from "./mermaid.js";
import { parseDot } from "./dot.js";
import { parseDrawio } from "./drawio.js";
import { graphToScene } from "./to-scene.js";

export type {
  GraphDocument,
  GraphNode,
  GraphEdge,
  NodeShape,
  EdgeDirection,
  GraphLayoutDirection,
} from "./graph.js";
export type { LayoutedNode } from "./layout.js";

export { parseMermaid } from "./mermaid.js";
export { exportMermaid } from "./mermaid-export.js";
export { parseDot } from "./dot.js";
export { parseDrawio } from "./drawio.js";
export { layoutGraph } from "./layout.js";
export { graphToScene } from "./to-scene.js";
export { importExcalidraw } from "./excalidraw.js";
export { exportExcalidraw } from "./excalidraw-export.js";
export { importJsonCanvas } from "./jsoncanvas.js";

/**
 * One-shot helpers — parse + layout + materialise into a `Scene` in a
 * single call. Use these when you don't need intermediate access to the
 * `GraphDocument`.
 */
export const importMermaid = (source: string): Scene => graphToScene(parseMermaid(source));
export const importDot = (source: string): Scene => graphToScene(parseDot(source));
export const importDrawio = (source: string): Scene => graphToScene(parseDrawio(source));
