/**
 * Backend-neutral graph model that every importer produces. Layout +
 * scene-conversion live in `layout.ts` / `to-scene.ts`; each format
 * importer just has to fill this shape.
 *
 * Nodes have *logical* sizes (`width` / `height`). If a format ships
 * explicit coordinates (e.g. drawio), the importer can write them into
 * `position` and skip the layout step; otherwise the dagre layout assigns
 * them.
 */
export type NodeShape = "rectangle" | "ellipse" | "diamond" | "round";

export interface GraphNode {
  readonly id: string;
  readonly label?: string;
  readonly shape?: NodeShape;
  readonly width?: number;
  readonly height?: number;
  /** Explicit world-coordinate position, in pixels. Overrides layout. */
  readonly position?: { readonly x: number; readonly y: number };
  readonly fill?: string;
  readonly stroke?: string;
}

export type EdgeDirection = "directed" | "undirected";

export interface GraphEdge {
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly direction?: EdgeDirection;
}

export type GraphLayoutDirection = "TB" | "BT" | "LR" | "RL";

export interface GraphDocument {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  /** Hint for the layout engine. Defaults to `"TB"`. */
  readonly layout?: GraphLayoutDirection;
}
