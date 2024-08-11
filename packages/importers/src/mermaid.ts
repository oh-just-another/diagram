import type {
  GraphDocument,
  GraphEdge,
  GraphLayoutDirection,
  GraphNode,
  NodeShape,
} from "./graph.js";

/**
 * Minimal Mermaid flowchart importer. Supports the most common subset:
 *
 *   flowchart TD       (or `graph LR/TB/BT/RL`)
 *   A                  — node by id, default rectangle
 *   A[Label]           — rectangle with label
 *   A(Round)           — rounded (rendered as ellipse)
 *   A((Circle))        — ellipse
 *   A{Decision}        — diamond
 *   A --> B            — directed edge
 *   A --- B            — undirected edge
 *   A -->|label| B     — labelled edge
 *   A --> B --> C      — chained edges
 *   %% comment         — line ignored
 *   class statements   — ignored (no styling support yet)
 *
 * Anything we don't understand is skipped silently. Hosts that need full
 * Mermaid fidelity should preprocess with the official Mermaid parser.
 */
export const parseMermaid = (source: string): GraphDocument => {
  const lines = source.split(/\r?\n/);
  let layout: GraphLayoutDirection = "TB";
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    if (line.startsWith("class ") || line.startsWith("classDef ") || line.startsWith("style ")) {
      continue;
    }
    if (line.startsWith("subgraph") || line === "end") continue;

    const header = /^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)\b/i.exec(line);
    if (header) {
      const dir = header[1]!.toUpperCase();
      layout = dir === "TD" ? "TB" : (dir as GraphLayoutDirection);
      continue;
    }

    parseStatement(line, nodes, edges);
  }

  return { nodes: [...nodes.values()], edges, layout };
};

interface NodeMatch {
  readonly node: GraphNode;
  readonly length: number;
}

const NODE_RE = /^([A-Za-z_][A-Za-z0-9_]*)(\[\[?[^\]]*\]?\]|\(\(?[^)]*\)?\)|\{[^}]*\})?/;

const EDGE_RE = /^(<?[-=.]+>?)(?:\|([^|]*)\|)?/;

const parseStatement = (text: string, nodes: Map<string, GraphNode>, edges: GraphEdge[]): void => {
  let i = 0;
  let prev: string | null = null;
  let pendingEdge: { direction: "directed" | "undirected"; label?: string } | null = null;

  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length) break;

    const nodeMatch = matchNode(text.slice(i));
    if (nodeMatch) {
      // Merge with any earlier definition of the same id.
      const existing = nodes.get(nodeMatch.node.id);
      if (existing) {
        // Keep the more informative one (later definition with label wins).
        nodes.set(nodeMatch.node.id, { ...existing, ...nodeMatch.node });
      } else {
        nodes.set(nodeMatch.node.id, nodeMatch.node);
      }
      if (prev && pendingEdge) {
        const edge: GraphEdge = {
          source: prev,
          target: nodeMatch.node.id,
          direction: pendingEdge.direction,
          ...(pendingEdge.label !== undefined ? { label: pendingEdge.label } : {}),
        };
        edges.push(edge);
      }
      prev = nodeMatch.node.id;
      pendingEdge = null;
      i += nodeMatch.length;
      continue;
    }

    const edgeMatch = EDGE_RE.exec(text.slice(i));
    if (edgeMatch) {
      const arrow = edgeMatch[1]!;
      const label = edgeMatch[2];
      const direction: "directed" | "undirected" =
        arrow.includes(">") || arrow.includes("<") ? "directed" : "undirected";
      pendingEdge = label !== undefined ? { direction, label } : { direction };
      i += edgeMatch[0].length;
      continue;
    }

    // Unknown token — skip a char to avoid infinite loop.
    i += 1;
  }
};

const matchNode = (input: string): NodeMatch | null => {
  const m = NODE_RE.exec(input);
  if (!m) return null;
  const id = m[1]!;
  const bracket = m[2] ?? "";
  let shape: NodeShape | undefined;
  let label: string | undefined;

  if (bracket.startsWith("[[") && bracket.endsWith("]]")) {
    shape = "rectangle";
    label = bracket.slice(2, -2).trim() || undefined;
  } else if (bracket.startsWith("[") && bracket.endsWith("]")) {
    shape = "rectangle";
    label = bracket.slice(1, -1).trim() || undefined;
  } else if (bracket.startsWith("((") && bracket.endsWith("))")) {
    shape = "ellipse";
    label = bracket.slice(2, -2).trim() || undefined;
  } else if (bracket.startsWith("(") && bracket.endsWith(")")) {
    shape = "round";
    label = bracket.slice(1, -1).trim() || undefined;
  } else if (bracket.startsWith("{") && bracket.endsWith("}")) {
    shape = "diamond";
    label = bracket.slice(1, -1).trim() || undefined;
  }

  // Strip optional quotes around label.
  if (label && /^".*"$/.test(label)) label = label.slice(1, -1);

  const node: GraphNode = {
    id,
    ...(label !== undefined ? { label } : {}),
    ...(shape !== undefined ? { shape } : {}),
  };
  return { node, length: m[0].length };
};
