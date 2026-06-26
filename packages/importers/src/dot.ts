import type {
  GraphDocument,
  GraphEdge,
  GraphLayoutDirection,
  GraphNode,
  NodeShape,
} from "./graph.js";
import { req } from "@oh-just-another/types";

/**
 * Minimal Graphviz `dot` importer. Supports:
 *
 *   digraph G { ... }   — directed graph
 *   graph  G { ... }    — undirected
 *   rankdir=LR;         — layout direction (TB default)
 *   a -> b;             — directed edge
 *   a -- b;             — undirected edge
 *   a [label="X"];      — node attributes
 *   a [shape=box];      — node shape  (box / rectangle / ellipse / circle / diamond / oval)
 *   edge: `a -> b [label="x"]`
 *   Comments: `//`, `/* … *\/`, `#` at line start.
 *
 * Doesn't model subgraphs, ports, HTML labels, splines, or styles beyond
 * `label` / `shape`. Anything else is skipped.
 */
export const parseDot = (source: string): GraphDocument => {
  const stripped = stripComments(source);
  const body = extractBody(stripped);
  if (!body) return { nodes: [], edges: [], layout: "TB" };

  const tokens = tokenize(body.body);
  const isDirectedDefault = body.kind === "digraph";

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  let layout: GraphLayoutDirection = "TB";

  let i = 0;
  while (i < tokens.length) {
    const tok = req(tokens[i]);

    // Statement terminators.
    if (tok === ";") {
      i += 1;
      continue;
    }

    // Graph attribute: ident = value;
    if (
      isIdent(tok) &&
      tokens[i + 1] === "=" &&
      i + 2 < tokens.length &&
      isValueToken(req(tokens[i + 2]))
    ) {
      if (tok.toLowerCase() === "rankdir") {
        const value = unquote(req(tokens[i + 2])).toUpperCase();
        if (value === "TB" || value === "BT" || value === "LR" || value === "RL") {
          layout = value;
        }
      }
      i += 3;
      continue;
    }

    if (!isIdent(tok)) {
      i += 1;
      continue;
    }

    // Node or edge starting at this ident.
    const sourceId = unquote(tok);
    upsertNode(nodes, sourceId, {});
    i += 1;

    // Optional attribute block right after node id (node statement).
    if (tokens[i] === "[") {
      const attrs = readAttrBlock(tokens, i);
      i = attrs.next;
      upsertNode(nodes, sourceId, nodeAttrs(attrs.attrs));
      continue;
    }

    // Link: -> or -- to next node, possibly chained.
    let prev = sourceId;
    while (tokens[i] === "->" || tokens[i] === "--") {
      const op = req(tokens[i]);
      const direction: "directed" | "undirected" =
        op === "->" ? "directed" : isDirectedDefault ? "directed" : "undirected";
      i += 1;
      const nextTok = tokens[i];
      if (!nextTok || !isIdent(nextTok)) break;
      const targetId = unquote(nextTok);
      upsertNode(nodes, targetId, {});
      i += 1;

      // Optional edge attrs.
      let edgeLabel: string | undefined;
      if (tokens[i] === "[") {
        const attrs = readAttrBlock(tokens, i);
        i = attrs.next;
        if (attrs.attrs.label) edgeLabel = unquote(attrs.attrs.label);
      }

      const edge: GraphEdge = {
        source: prev,
        target: targetId,
        direction,
        ...(edgeLabel !== undefined ? { label: edgeLabel } : {}),
      };
      edges.push(edge);
      prev = targetId;
    }
  }

  return { nodes: [...nodes.values()], edges, layout };
};

// --- helpers ---

const stripComments = (s: string): string => {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (s[i] === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if ((i === 0 || s[i - 1] === "\n") && s[i] === "#") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    out += s.charAt(i);
    i++;
  }
  return out;
};

const extractBody = (source: string): { kind: "digraph" | "graph"; body: string } | null => {
  const m =
    /^\s*(?:strict\s+)?(digraph|graph)\s+(?:[A-Za-z_][A-Za-z0-9_]*\s+|"[^"]*"\s+)?\{([\s\S]*)\}\s*$/.exec(
      source,
    );
  if (!m) return null;
  return { kind: m[1] as "digraph" | "graph", body: m[2] ?? "" };
};

const tokenize = (body: string): string[] => {
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    const c = body.charAt(i);
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < body.length && body[j] !== '"') {
        if (body[j] === "\\" && j + 1 < body.length) j += 2;
        else j++;
      }
      out.push(body.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (c === "-" && body[i + 1] === ">") {
      out.push("->");
      i += 2;
      continue;
    }
    if (c === "-" && body[i + 1] === "-") {
      out.push("--");
      i += 2;
      continue;
    }
    if (c === "[" || c === "]" || c === "{" || c === "}" || c === ";" || c === "," || c === "=") {
      out.push(c);
      i++;
      continue;
    }
    if (/[A-Za-z_0-9.]/.test(c)) {
      let j = i;
      while (j < body.length && /[A-Za-z_0-9.]/.test(body.charAt(j))) j++;
      out.push(body.slice(i, j));
      i = j;
      continue;
    }
    // Unknown char — skip.
    i++;
  }
  return out;
};

const isIdent = (tok: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_.]*$/.test(tok) || tok.startsWith('"');
const isValueToken = (tok: string): boolean => tok.startsWith('"') || /^[A-Za-z_0-9.]+$/.test(tok);

const unquote = (tok: string): string =>
  tok.startsWith('"') && tok.endsWith('"') ? tok.slice(1, -1) : tok;

const readAttrBlock = (
  tokens: readonly string[],
  start: number,
): { attrs: Record<string, string>; next: number } => {
  // start points at "[".
  const attrs: Record<string, string> = {};
  let i = start + 1;
  while (i < tokens.length && tokens[i] !== "]") {
    const key = req(tokens[i]);
    if (tokens[i + 1] === "=" && i + 2 < tokens.length) {
      attrs[key.toLowerCase()] = req(tokens[i + 2]);
      i += 3;
      if (tokens[i] === "," || tokens[i] === ";") i++;
    } else {
      i++;
    }
  }
  return { attrs, next: i + 1 }; // skip "]"
};

const nodeAttrs = (raw: Record<string, string>): Partial<GraphNode> => {
  let label: string | undefined;
  let shape: NodeShape | undefined;
  let fill: string | undefined;
  let stroke: string | undefined;
  if (raw.label) label = unquote(raw.label);
  if (raw.shape) shape = dotShape(unquote(raw.shape).toLowerCase());
  if (raw.fillcolor) fill = unquote(raw.fillcolor);
  if (raw.color) stroke = unquote(raw.color);
  return {
    ...(label !== undefined ? { label } : {}),
    ...(shape !== undefined ? { shape } : {}),
    ...(fill !== undefined ? { fill } : {}),
    ...(stroke !== undefined ? { stroke } : {}),
  };
};

const dotShape = (s: string): NodeShape | undefined => {
  switch (s) {
    case "box":
    case "rect":
    case "rectangle":
    case "square":
      return "rectangle";
    case "ellipse":
    case "oval":
      return "ellipse";
    case "circle":
      return "ellipse";
    case "diamond":
      return "diamond";
    default:
      return undefined;
  }
};

const upsertNode = (nodes: Map<string, GraphNode>, id: string, extra: Partial<GraphNode>): void => {
  const existing = nodes.get(id) ?? { id };
  nodes.set(id, { ...existing, ...extra });
};
