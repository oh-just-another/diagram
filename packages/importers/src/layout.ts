import dagre from "@dagrejs/dagre";
import type { GraphDocument, GraphLayoutDirection, GraphNode } from "./graph.js";

const DEFAULT_NODE_W = 120;
const DEFAULT_NODE_H = 60;
const NODE_SEP = 40;
const RANK_SEP = 60;

export interface LayoutedNode extends GraphNode {
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
}

/**
 * Compute world-space coordinates for every node. Nodes that already have
 * a `position` are kept as-is; the rest are run through dagre with the
 * direction hinted by `graph.layout`.
 *
 * Returns a new graph where every node has explicit `position`, `width`,
 * and `height`. Links are unchanged.
 */
export const layoutGraph = (
  graph: GraphDocument,
): {
  readonly nodes: readonly LayoutedNode[];
  readonly edges: GraphDocument["edges"];
} => {
  const direction = graph.layout ?? "TB";

  // Skip dagre entirely if every node already carries an explicit position
  // (drawio is the typical case).
  const allPositioned =
    graph.nodes.length > 0 && graph.nodes.every((n) => n.position !== undefined);
  if (allPositioned) {
    return {
      nodes: graph.nodes.map((n) => ({
        ...n,
        position: n.position!,
        width: n.width ?? DEFAULT_NODE_W,
        height: n.height ?? DEFAULT_NODE_H,
      })),
      edges: graph.edges,
    };
  }

  const g = new dagre.graphlib.Graph<{ width: number; height: number }>({
    multigraph: true,
    directed: true,
  });
  g.setGraph({
    rankdir: dagreDirection(direction),
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of graph.nodes) {
    g.setNode(n.id, {
      width: n.width ?? DEFAULT_NODE_W,
      height: n.height ?? DEFAULT_NODE_H,
    });
  }
  for (const e of graph.edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const out: LayoutedNode[] = [];
  for (const n of graph.nodes) {
    const dagreNode = g.node(n.id);
    if (n.position) {
      // Keep explicit position even when dagre ran for the other nodes.
      out.push({
        ...n,
        position: n.position,
        width: n.width ?? dagreNode.width ?? DEFAULT_NODE_W,
        height: n.height ?? dagreNode.height ?? DEFAULT_NODE_H,
      });
      continue;
    }
    // dagre returns the *centre* of each node; we want the top-left.
    const w = n.width ?? dagreNode.width ?? DEFAULT_NODE_W;
    const h = n.height ?? dagreNode.height ?? DEFAULT_NODE_H;
    out.push({
      ...n,
      width: w,
      height: h,
      position: { x: dagreNode.x - w / 2, y: dagreNode.y - h / 2 },
    });
  }

  return { nodes: out, edges: graph.edges };
};

const dagreDirection = (d: GraphLayoutDirection): "TB" | "BT" | "LR" | "RL" => d;
