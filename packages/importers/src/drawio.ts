import type { GraphDocument, GraphEdge, GraphNode, NodeShape } from "./graph.js";

/**
 * Minimal drawio importer. Targets the *uncompressed* `mxGraphModel` XML
 * payload — what you get from `<mxfile>...<diagram>...<mxGraphModel>...`
 * when "Pretty print" is on, or the inner `<root>...</root>` of a saved
 * `.drawio` file.
 *
 * Supports:
 *   - `<mxCell vertex="1" style="..." value="..."><mxGeometry .../></mxCell>`
 *     → `GraphNode` with explicit position (so layout is skipped).
 *   - `<mxCell edge="1" source="..." target="..." value="..." />`
 *     → `GraphEdge`.
 *
 * Shape is inferred from the `style="..."` attribute (`ellipse`,
 * `rhombus`/`diamond`, otherwise rectangle). Drawio-style colour stops,
 * groups, swimlanes, etc. are ignored.
 */
export const parseDrawio = (source: string): GraphDocument => {
  // Pull out cells with a single regex sweep. drawio XML has stable
  // structure within a `<root>`; we don't need a full XML parser to read
  // it.
  const cellRe = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(source)) !== null) {
    const attrs = parseAttrs(m[1] ?? "");
    const inner = m[2] ?? "";
    const id = attrs.id ?? "";
    if (!id) continue;

    if (attrs.edge === "1") {
      if (!attrs.source || !attrs.target) continue;
      const edge: GraphEdge = {
        source: attrs.source,
        target: attrs.target,
        direction: "directed",
        ...(attrs.value !== undefined && attrs.value !== ""
          ? { label: decodeEntities(attrs.value) }
          : {}),
      };
      edges.push(edge);
      continue;
    }

    if (attrs.vertex === "1") {
      const geom = extractGeometry(inner);
      const shape = shapeFromStyle(attrs.style);
      const node: GraphNode = {
        id,
        ...(attrs.value !== undefined && attrs.value !== ""
          ? { label: decodeEntities(attrs.value) }
          : {}),
        ...(shape !== undefined ? { shape } : {}),
        ...(geom?.size !== undefined ? { width: geom.size.width, height: geom.size.height } : {}),
        ...(geom?.position !== undefined ? { position: geom.position } : {}),
      };
      nodes.set(id, node);
      continue;
    }
  }

  return { nodes: [...nodes.values()], edges };
};

// --- helpers ---

const parseAttrs = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out[m[1]!] = m[2]!;
  return out;
};

interface Geometry {
  readonly position?: { x: number; y: number };
  readonly size?: { width: number; height: number };
}

const extractGeometry = (inner: string): Geometry | null => {
  const g = /<mxGeometry\b([^>]*?)(?:\/>|>[\s\S]*?<\/mxGeometry>)/.exec(inner);
  if (!g) return null;
  const a = parseAttrs(g[1] ?? "");
  const num = (s: string | undefined): number | null => {
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const x = num(a.x);
  const y = num(a.y);
  const w = num(a.width);
  const h = num(a.height);
  return {
    ...(x !== null && y !== null ? { position: { x, y } } : {}),
    ...(w !== null && h !== null ? { size: { width: w, height: h } } : {}),
  };
};

const shapeFromStyle = (style: string | undefined): NodeShape | undefined => {
  if (style === undefined) return undefined;
  const lower = style.toLowerCase();
  // Custom shapes / images — let the caller decide what to do.
  if (lower.includes("shape=mxgraph") || lower.includes("shape=image")) return undefined;
  if (lower.includes("ellipse")) return "ellipse";
  if (lower.includes("rhombus") || lower.includes("diamond")) return "diamond";
  if (lower.includes("rounded=1")) return "round";
  // Drawio's default vertex style is `""` or `rounded=0;whiteSpace=wrap;` —
  // both mean "plain rectangle". Fall through to rectangle.
  return "rectangle";
};

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<br>/g, "\n")
    .replace(/<br\/>/g, "\n");
