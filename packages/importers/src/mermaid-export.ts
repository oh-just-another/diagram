import {
  getElementWorldBounds,
  isEllipse,
  isPolygon,
  isRectangle,
  isText,
  type ElementBase,
  type Link,
  type LinkEndpoint,
  type Scene,
} from "@oh-just-another/scene";
import type { ElementId } from "@oh-just-another/types";

/**
 * Export a `Scene` as a Mermaid `flowchart TD` document — the inverse of
 * {@link parseMermaid} / `importMermaid`.
 *
 * Node mapping (label taken from a `text` element centred over the shape):
 *   - `rectangle` → `id[label]`
 *   - `ellipse`   → `id((label))`
 *   - `polygon`   → `id{label}` (diamonds and other polygons)
 *
 * Edges become `A --> B`, or `A -->|label| B` when the link carries a label
 * (`link.label.text`, falling back to a string `metadata.label`). Endpoints
 * that don't reference an exported node (free points, connectors to
 * non-graph shapes) are dropped.
 *
 * Non-graph elements (`brush`, `image`, `template`, frames, groups, paths,
 * block-arrows, and any standalone text) are emitted as `%% skipped: <type>`
 * comments so the omission is visible without breaking the flowchart.
 *
 * `importMermaid(exportMermaid(scene))` round-trips the graph structure
 * (nodes + edges). Labels are sanitised to stay inside Mermaid's bracket
 * grammar: newlines and the bracket/pipe characters `[]{}()|` collapse to
 * spaces.
 */
export const exportMermaid = (scene: Scene): string => {
  const lines: string[] = ["flowchart TD"];

  const elements = [...scene.elements.values()];
  const nodeEls = elements.filter(isGraphNode);
  const texts = elements.filter(isText);

  // Assign each node a Mermaid-safe, unique id.
  const idMap = new Map<ElementId, string>();
  const used = new Set<string>();
  for (const el of nodeEls) idMap.set(el.id, uniqueId(String(el.id), used));

  // Attach the first text element whose centre sits inside a node as that
  // node's label; consumed texts don't become skip comments.
  const consumed = new Set<ElementId>();
  const labelOf = new Map<ElementId, string>();
  for (const node of nodeEls) {
    const box = getElementWorldBounds(node);
    for (const t of texts) {
      if (consumed.has(t.id)) continue;
      const c = centre(t);
      if (c.x >= box.x && c.x <= box.x + box.width && c.y >= box.y && c.y <= box.y + box.height) {
        const label = sanitizeLabel(t.text);
        if (label) labelOf.set(node.id, label);
        consumed.add(t.id);
        break;
      }
    }
  }

  for (const node of nodeEls) {
    const id = idMap.get(node.id);
    if (id === undefined) continue;
    lines.push(nodeDecl(id, node, labelOf.get(node.id)));
  }

  for (const link of scene.links.values()) {
    const src = endpointNodeId(link.from, idMap);
    const tgt = endpointNodeId(link.to, idMap);
    if (src === undefined || tgt === undefined) continue;
    const label = linkLabel(link);
    lines.push(label ? `${src} -->|${label}| ${tgt}` : `${src} --> ${tgt}`);
  }

  // Visibility for everything we couldn't represent as a node/label.
  for (const el of elements) {
    if (isGraphNode(el)) continue;
    if (isText(el) && consumed.has(el.id)) continue;
    lines.push(`%% skipped: ${el.type}`);
  }

  return lines.join("\n");
};

const isGraphNode = (el: ElementBase): boolean => isRectangle(el) || isEllipse(el) || isPolygon(el);

const nodeDecl = (id: string, el: ElementBase, label: string | undefined): string => {
  if (isEllipse(el)) return `${id}((${label ?? ""}))`;
  if (isPolygon(el)) return `${id}{${label ?? ""}}`;
  // rectangle (default)
  return label !== undefined ? `${id}[${label}]` : id;
};

const linkLabel = (link: Link): string | undefined => {
  const inline = link.label?.text;
  if (inline !== undefined) return sanitizeLabel(inline) || undefined;
  const meta = link.metadata?.label;
  return typeof meta === "string" ? sanitizeLabel(meta) || undefined : undefined;
};

/** Resolve the exported Mermaid id for a link endpoint, or `undefined`. */
const endpointNodeId = (ep: LinkEndpoint, idMap: Map<ElementId, string>): string | undefined =>
  ep.kind === "point" ? undefined : idMap.get(ep.elementId);

const centre = (el: ElementBase): { x: number; y: number } => {
  const b = getElementWorldBounds(el);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Coerce an element id into `[A-Za-z_][A-Za-z0-9_]*`, deduped. */
const uniqueId = (raw: string, used: Set<string>): string => {
  let base = raw.replace(/[^A-Za-z0-9_]/g, "_");
  if (!/^[A-Za-z_]/.test(base)) base = `n_${base}`;
  let id = base;
  let i = 1;
  while (used.has(id)) id = `${base}_${String(i++)}`;
  used.add(id);
  return id;
};

/** Strip characters that would break Mermaid's bracket / pipe grammar. */
const sanitizeLabel = (text: string): string =>
  text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[[\]{}()|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
