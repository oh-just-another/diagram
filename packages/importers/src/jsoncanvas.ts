import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Element,
  type Link,
  type LinkLabel,
  type NamedAnchor,
  type Scene,
} from "@oh-just-another/scene";
import { DEFAULT_EDGE_STYLE, HUE_TONES } from "@oh-just-another/tokens";
import { elementId, linkId, type Bounds, type ElementId } from "@oh-just-another/types";
import { EDGE_STROKE_WIDTH, JSONCANVAS_FONT_SIZE, JSONCANVAS_PRESET_COLORS } from "./constants.js";
import { fitViewportToBoxes } from "./fit-viewport.js";
import { asArray, asNumber, asRecord, asString, parseJsonRecord } from "./json-value.js";

/**
 * Import a JSON Canvas document (jsoncanvas.org — `nodes[]` + `edges[]`)
 * into a `Scene`.
 *
 * Mapping:
 *   - `text` node  → `text` element (raw Markdown text, node width as wrap
 *                    budget)
 *   - `file` node  → `text` element showing the file path (+ `#subpath`)
 *   - `link` node  → `text` element showing the URL, with `href` set
 *   - `group` node → `frame` element (label → frame name)
 *   - edge         → `Link` with `straight` routing; `fromSide` / `toSide`
 *                    become named anchors (missing side → `center`),
 *                    `label` → link label, `toEnd`/`fromEnd` → arrowheads
 *                    (`toEnd` defaults to an arrow per the spec)
 *
 * Preset colours `"1"`–`"6"` map to hex via `JSONCANVAS_PRESET_COLORS`; hex
 * colours pass through. Unknown node types and edges referencing missing
 * nodes are skipped silently. Empty input yields an empty scene; malformed
 * JSON throws.
 */
export const importJsonCanvas = (source: string): Scene => {
  const doc = parseJsonRecord(source, "JSON Canvas");

  let scene = emptyScene();
  let order = orderBetween(null, null);
  const idMap = new Map<string, ElementId>();
  const boxes: Bounds[] = [];

  let index = 0;
  for (const raw of asArray(doc.nodes)) {
    const node = asRecord(raw);
    const rawId = asString(node.id, `node-${String(index)}`);
    index += 1;
    if (idMap.has(rawId)) continue;
    const element = convertNode(node, elementId(rawId), order);
    if (!element) continue;
    order = orderBetween(order, null);
    idMap.set(rawId, element.id);
    ({ scene } = addElement(scene, element));
    boxes.push({
      x: asNumber(node.x),
      y: asNumber(node.y),
      width: asNumber(node.width),
      height: asNumber(node.height),
    });
  }

  let edgeOrder = orderBetween(null, null);
  let edgeIndex = 0;
  for (const raw of asArray(doc.edges)) {
    const edge = asRecord(raw);
    const link = convertEdge(edge, edgeIndex, idMap, edgeOrder);
    edgeIndex += 1;
    if (!link || scene.links.has(link.id)) continue;
    edgeOrder = orderBetween(edgeOrder, null);
    ({ scene } = addLink(scene, link));
  }

  return fitViewportToBoxes(scene, boxes);
};

type OrderKey = ReturnType<typeof orderBetween>;

const convertNode = (
  node: Record<string, unknown>,
  id: ElementId,
  order: OrderKey,
): Element | null => {
  const type = asString(node.type);
  const x = asNumber(node.x);
  const y = asNumber(node.y);
  const width = asNumber(node.width);
  const height = asNumber(node.height);
  const color = canvasColor(asString(node.color));

  const base = {
    id,
    layerId: DEFAULT_LAYER_ID,
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order,
  };
  const textBase = {
    ...base,
    type: "text" as const,
    style: {
      fill: color ?? HUE_TONES.light.gray.textHigh,
      textBaseline: "top" as const,
    },
    fontFamily: "system-ui, sans-serif",
    fontSize: JSONCANVAS_FONT_SIZE,
    maxWidth: width,
  };

  switch (type) {
    case "text":
      return { ...textBase, text: asString(node.text) };
    case "file": {
      const subpath = asString(node.subpath);
      return { ...textBase, text: asString(node.file) + subpath };
    }
    case "link": {
      const url = asString(node.url);
      return { ...textBase, text: url, ...(url !== "" ? { href: url } : {}) };
    }
    case "group": {
      const label = asString(node.label);
      return {
        ...base,
        type: "frame",
        width,
        height,
        style: color !== undefined ? { stroke: color } : {},
        ...(label !== "" ? { name: label } : {}),
      };
    }
    default:
      // Unknown node type — skip, never throw.
      return null;
  }
};

const convertEdge = (
  edge: Record<string, unknown>,
  index: number,
  idMap: ReadonlyMap<string, ElementId>,
  order: OrderKey,
): Link | null => {
  const fromId = idMap.get(asString(edge.fromNode));
  const toId = idMap.get(asString(edge.toNode));
  if (fromId === undefined || toId === undefined) return null;

  const color = canvasColor(asString(edge.color));
  const labelText = asString(edge.label);
  const label: LinkLabel = { text: labelText };
  const fromEnd = asString(edge.fromEnd, "none");
  const toEnd = asString(edge.toEnd, "arrow"); // spec default: arrow at `to`

  return {
    id: linkId(asString(edge.id, `edge-${String(index)}`)),
    layerId: DEFAULT_LAYER_ID,
    from: { kind: "anchor", elementId: fromId, anchor: sideAnchor(asString(edge.fromSide)) },
    to: { kind: "anchor", elementId: toId, anchor: sideAnchor(asString(edge.toSide)) },
    routing: "straight",
    ...(fromEnd === "arrow" || toEnd === "arrow"
      ? {
          arrowheads: {
            ...(fromEnd === "arrow" ? { from: "arrow" as const } : {}),
            ...(toEnd === "arrow" ? { to: "arrow" as const } : {}),
          },
        }
      : {}),
    ...(labelText !== "" ? { label } : {}),
    order,
    style: {
      ...DEFAULT_EDGE_STYLE,
      strokeWidth: EDGE_STROKE_WIDTH,
      ...(color !== undefined ? { stroke: color } : {}),
    },
  };
};

const sideAnchor = (side: string): { kind: "named"; name: NamedAnchor } => ({
  kind: "named",
  name:
    side === "top" || side === "right" || side === "bottom" || side === "left" ? side : "center",
});

/** `"1"`–`"6"` presets → hex; `#rrggbb` passes through; else undefined. */
const canvasColor = (color: string): string | undefined => {
  if (color === "") return undefined;
  const preset = JSONCANVAS_PRESET_COLORS[color];
  if (preset !== undefined) return preset;
  return color.startsWith("#") ? color : undefined;
};
