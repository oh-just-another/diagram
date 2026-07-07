import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  getElementWorldBounds,
  orderBetween,
  type ArrowheadStyle,
  type BrushPoint,
  type Element,
  type Link,
  type LinkArrowheads,
  type LinkEndpoint,
  type Scene,
  type Style,
  type TextAlign,
  type TextStyle,
} from "@oh-just-another/scene";
import { HUE_TONES } from "@oh-just-another/tokens";
import { elementId, linkId, type Bounds, type ElementId, type Vec2 } from "@oh-just-another/types";
import {
  DASH_PATTERN_DASHED,
  DASH_PATTERN_DOTTED,
  EXCALIDRAW_DEFAULT_FONT_SIZE,
  EXCALIDRAW_DEFAULT_STROKE,
  EXCALIDRAW_OPACITY_SCALE,
  EXCALIDRAW_PRESSURE_FALLBACK,
  FREEDRAW_WIDTH_PER_PRESSURE,
} from "./constants.js";
import { fitViewportToBoxes } from "./fit-viewport.js";
import { asArray, asNumber, asRecord, asString, parseJsonRecord } from "./json-value.js";

/**
 * Import a `.excalidraw` document (JSON with an `elements` array) into a
 * `Scene`.
 *
 * Mapping:
 *   - `rectangle` / `ellipse` → the matching built-in shape
 *   - `diamond`               → 4-point `polygon`
 *   - `text`                  → `text` element
 *   - `freedraw`              → `brush` element (pressures → per-point width)
 *   - `image`                 → `image` element (data URL resolved from `files`)
 *   - `frame`                 → `frame` element (children keep membership)
 *   - `arrow` / open `line`   → `Link` with `straight` routing; bound ends
 *                               become anchor endpoints, free ends point
 *                               endpoints, interior points waypoints
 *   - closed `line`           → `polygon` (outline returns to its start)
 *
 * Rotation (`angle`, applied around the element centre in the source format)
 * is converted to our origin-based `rotation` by re-deriving the local
 * origin's world position. Nested groups are flattened: each element joins a
 * `group` element for its *outermost* `groupIds` entry only. Unknown element
 * types and deleted elements are skipped silently. Empty input yields an
 * empty scene; malformed JSON throws.
 */
export const importExcalidraw = (source: string): Scene => {
  const doc = parseJsonRecord(source, ".excalidraw");
  const rawElements = asArray(doc.elements);
  const files = asRecord(doc.files);

  let scene = emptyScene();
  let order = orderBetween(null, null);
  const nextOrder = (): typeof order => {
    const o = order;
    order = orderBetween(order, null);
    return o;
  };

  const shapes: Record<string, unknown>[] = [];
  const connectors: Record<string, unknown>[] = [];
  for (const raw of rawElements) {
    const el = asRecord(raw);
    if (el.isDeleted === true) continue;
    const type = asString(el.type);
    // Closed lines are polygon outlines, not connectors.
    if (type === "arrow" || (type === "line" && !isClosedLine(el))) connectors.push(el);
    else shapes.push(el);
  }

  // Flattened groups: one `group` element per distinct outermost group id.
  const groupMap = new Map<string, ElementId>();
  for (const el of shapes) {
    const outer = outermostGroupId(el);
    if (outer !== undefined && !groupMap.has(outer)) {
      groupMap.set(outer, elementId(`group-${outer}`));
    }
  }
  for (const gid of groupMap.values()) {
    const group: Element = {
      id: gid,
      layerId: DEFAULT_LAYER_ID,
      type: "group",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: nextOrder(),
      style: {},
    };
    ({ scene } = addElement(scene, group));
  }

  // Frames are shapes too — pre-register their ids so children processed
  // before their frame still resolve `frameId`.
  const frameMap = new Map<string, ElementId>();
  for (const el of shapes) {
    if (asString(el.type) === "frame") {
      const rawId = asString(el.id);
      if (rawId) frameMap.set(rawId, elementId(rawId));
    }
  }

  const idMap = new Map<string, ElementId>();
  const boxes: Bounds[] = [];
  let index = 0;
  for (const el of shapes) {
    const rawId = asString(el.id, `el-${String(index)}`);
    index += 1;
    if (idMap.has(rawId)) continue;
    const element = convertShape(el, elementId(rawId), files, nextOrder(), groupMap, frameMap);
    if (!element) continue;
    idMap.set(rawId, element.id);
    ({ scene } = addElement(scene, element));
    boxes.push(getElementWorldBounds(element));
  }

  let edgeOrder = orderBetween(null, null);
  let linkIndex = 0;
  for (const el of connectors) {
    const link = convertConnector(el, linkIndex, idMap, edgeOrder, boxes);
    linkIndex += 1;
    if (!link || scene.links.has(link.id)) continue;
    edgeOrder = orderBetween(edgeOrder, null);
    ({ scene } = addLink(scene, link));
  }

  return fitViewportToBoxes(scene, boxes);
};

// --- shapes ---

type OrderKey = ReturnType<typeof orderBetween>;

const convertShape = (
  el: Record<string, unknown>,
  id: ElementId,
  files: Record<string, unknown>,
  order: OrderKey,
  groupMap: ReadonlyMap<string, ElementId>,
  frameMap: ReadonlyMap<string, ElementId>,
): Element | null => {
  const type = asString(el.type);
  const x = asNumber(el.x);
  const y = asNumber(el.y);
  const w = asNumber(el.width);
  const h = asNumber(el.height);
  const angle = asNumber(el.angle);

  const outer = outermostGroupId(el);
  const parentId = outer !== undefined ? groupMap.get(outer) : undefined;
  const frameRef = asString(el.frameId);
  const frameId = frameRef ? frameMap.get(frameRef) : undefined;
  const href = asString(el.link);
  const base = {
    id,
    layerId: DEFAULT_LAYER_ID,
    position: rotatedTopLeft(x, y, w, h, angle),
    rotation: angle,
    scale: { x: 1, y: 1 },
    order,
    style: styleFromExcalidraw(el),
    ...(parentId !== undefined ? { parentId } : {}),
    ...(frameId !== undefined ? { frameId } : {}),
    ...(el.locked === true ? { locked: true } : {}),
    ...(href !== "" ? { href } : {}),
  };

  switch (type) {
    case "rectangle":
      return { ...base, type: "rectangle", width: w, height: h };
    case "ellipse":
      return { ...base, type: "ellipse", width: w, height: h };
    case "diamond":
      return { ...base, type: "polygon", points: diamondPoints(w, h) };
    case "line": {
      // Only closed lines reach here (see classification) — import as polygon.
      const points = localPoints(el);
      points.pop(); // drop the duplicated closing point
      if (points.length < 3) return null;
      return { ...base, type: "polygon", points };
    }
    case "text": {
      const align = asString(el.textAlign);
      const opacity = opacityOf(el);
      const style: TextStyle = {
        fill: asString(el.strokeColor, HUE_TONES.light.gray.textHigh),
        textBaseline: "top",
        ...(isTextAlign(align) ? { textAlign: align } : {}),
        ...(opacity !== undefined ? { opacity } : {}),
      };
      return {
        ...base,
        type: "text",
        style,
        text: asString(el.text),
        fontFamily: fontFamilyFromCode(asNumber(el.fontFamily, -1)),
        fontSize: asNumber(el.fontSize, EXCALIDRAW_DEFAULT_FONT_SIZE),
      };
    }
    case "freedraw": {
      const strokeWidth = asNumber(el.strokeWidth, 1);
      const pressures = asArray(el.pressures);
      const points: BrushPoint[] = [];
      let i = 0;
      for (const raw of asArray(el.points)) {
        const p = asArray(raw);
        if (p.length < 2) continue;
        const pressure = asNumber(pressures[i], EXCALIDRAW_PRESSURE_FALLBACK);
        i += 1;
        points.push({
          x: asNumber(p[0]),
          y: asNumber(p[1]),
          width: strokeWidth * FREEDRAW_WIDTH_PER_PRESSURE * pressure,
        });
      }
      if (points.length === 0) return null;
      return { ...base, type: "brush", points };
    }
    case "image": {
      const file = asRecord(files[asString(el.fileId)]);
      const dataURL = asString(file.dataURL);
      if (dataURL === "") return null;
      return { ...base, type: "image", src: dataURL, width: w, height: h };
    }
    case "frame": {
      const name = asString(el.name);
      return { ...base, type: "frame", width: w, height: h, ...(name ? { name } : {}) };
    }
    default:
      // Unknown element type — skip, never throw.
      return null;
  }
};

// --- connectors ---

const convertConnector = (
  el: Record<string, unknown>,
  index: number,
  idMap: ReadonlyMap<string, ElementId>,
  order: OrderKey,
  boxes: Bounds[],
): Link | null => {
  const x = asNumber(el.x);
  const y = asNumber(el.y);
  const world: Vec2[] = localPoints(el).map((p) => ({ x: x + p.x, y: y + p.y }));
  if (world.length < 2) return null;
  for (const p of world) boxes.push({ x: p.x, y: p.y, width: 0, height: 0 });

  const first = world[0];
  const last = world[world.length - 1];
  if (!first || !last) return null;
  const from = endpointFor(el.startBinding, first, idMap);
  const to = endpointFor(el.endBinding, last, idMap);
  const waypoints = world.slice(1, -1);

  const isArrow = asString(el.type) === "arrow";
  const fromHead = arrowheadFor(el, "startArrowhead", "none");
  const toHead = arrowheadFor(el, "endArrowhead", isArrow ? "arrow" : "none");
  const arrowheads: LinkArrowheads = {
    ...(fromHead !== "none" ? { from: fromHead } : {}),
    ...(toHead !== "none" ? { to: toHead } : {}),
  };

  return {
    id: linkId(asString(el.id, `link-${String(index)}`)),
    layerId: DEFAULT_LAYER_ID,
    from,
    to,
    routing: "straight",
    ...(waypoints.length > 0 ? { waypoints } : {}),
    ...(fromHead !== "none" || toHead !== "none" ? { arrowheads } : {}),
    order,
    style: styleFromExcalidraw(el),
  };
};

const endpointFor = (
  binding: unknown,
  fallback: Vec2,
  idMap: ReadonlyMap<string, ElementId>,
): LinkEndpoint => {
  const bound = idMap.get(asString(asRecord(binding).elementId));
  return bound !== undefined
    ? { kind: "anchor", elementId: bound, anchor: { kind: "named", name: "center" } }
    : { kind: "point", position: fallback };
};

/** Arrowhead vocabulary of the source format → our `ArrowheadStyle`. */
const ARROWHEAD_FROM_EXCALIDRAW: Readonly<Record<string, ArrowheadStyle>> = {
  arrow: "arrow",
  triangle: "filledArrow",
  triangle_outline: "triangle",
  dot: "filledCircle",
  circle: "filledCircle",
  circle_outline: "circle",
  diamond: "filledRhombus",
  diamond_outline: "rhombus",
  bar: "none",
};

const arrowheadFor = (
  el: Record<string, unknown>,
  key: "startArrowhead" | "endArrowhead",
  fallback: ArrowheadStyle,
): ArrowheadStyle => {
  const v = el[key];
  if (v === undefined) return fallback; // field absent → format default
  if (v === null) return "none"; // explicit "no arrowhead"
  return ARROWHEAD_FROM_EXCALIDRAW[asString(v)] ?? "arrow";
};

// --- shared helpers ---

const localPoints = (el: Record<string, unknown>): Vec2[] => {
  const out: Vec2[] = [];
  for (const raw of asArray(el.points)) {
    const p = asArray(raw);
    if (p.length < 2) continue;
    out.push({ x: asNumber(p[0]), y: asNumber(p[1]) });
  }
  return out;
};

/** A `line` whose last point returns to its first is a polygon outline. */
const isClosedLine = (el: Record<string, unknown>): boolean => {
  const points = localPoints(el);
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return first !== undefined && first.x === last?.x && first.y === last.y;
};

const outermostGroupId = (el: Record<string, unknown>): string | undefined => {
  const gids = asArray(el.groupIds).filter((g): g is string => typeof g === "string");
  return gids.at(-1);
};

const opacityOf = (el: Record<string, unknown>): number | undefined => {
  const opacity = asNumber(el.opacity, EXCALIDRAW_OPACITY_SCALE);
  return opacity < EXCALIDRAW_OPACITY_SCALE ? opacity / EXCALIDRAW_OPACITY_SCALE : undefined;
};

const styleFromExcalidraw = (el: Record<string, unknown>): Style => {
  const fill = asString(el.backgroundColor, "transparent");
  const strokeStyle = asString(el.strokeStyle, "solid");
  const opacity = opacityOf(el);
  const roundness = el.roundness;
  return {
    stroke: asString(el.strokeColor, EXCALIDRAW_DEFAULT_STROKE),
    strokeWidth: asNumber(el.strokeWidth, 1),
    ...(fill !== "" && fill !== "transparent" ? { fill } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(strokeStyle === "dashed" ? { dashArray: DASH_PATTERN_DASHED } : {}),
    ...(strokeStyle === "dotted" ? { dashArray: DASH_PATTERN_DOTTED } : {}),
    ...(typeof roundness === "object" && roundness !== null
      ? { roundness: { type: "round" as const } }
      : {}),
  };
};

/**
 * The source format rotates around the element centre; our shapes rotate
 * around their local origin. Return the world position of the local origin
 * so the rotated silhouettes coincide.
 */
const rotatedTopLeft = (x: number, y: number, w: number, h: number, angle: number): Vec2 => {
  if (angle === 0) return { x, y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    x: cx + (-w / 2) * cos - (-h / 2) * sin,
    y: cy + (-w / 2) * sin + (-h / 2) * cos,
  };
};

const diamondPoints = (w: number, h: number): readonly Vec2[] => [
  { x: w / 2, y: 0 },
  { x: w, y: h / 2 },
  { x: w / 2, y: h },
  { x: 0, y: h / 2 },
];

const isTextAlign = (v: string): v is TextAlign => v === "left" || v === "center" || v === "right";

/** Numeric font-family codes of the source format → CSS family stacks. */
const fontFamilyFromCode = (code: number): string => {
  if (code === 3 || code === 8) return "monospace";
  if (code === 2 || code === 6 || code === 7) return "Helvetica, sans-serif";
  return "system-ui, sans-serif";
};
