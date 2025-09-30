import type { Element, Style } from "@oh-just-another/scene";
import { DEFAULT_SHAPE_STYLES } from "@oh-just-another/tokens";
import type { Vec2 } from "@oh-just-another/types";
import {
  DATA_ICON,
  DECISION_ICON,
  DIAMOND_ICON,
  DOCUMENT_ICON,
  ELLIPSE_ICON,
  HEXAGON_ICON,
  PROCESS_ICON,
  RECT_ICON,
  STICKY_ICON,
  TERMINATOR_ICON,
  TRIANGLE_ICON,
} from "./icons.js";
import { defaultRegistry, type TemplateRegistry } from "./registry.js";
import type { Template, TemplateContext } from "./types.js";

// --- Local helpers ---

const baseElement = (ctx: TemplateContext) => ({
  id: ctx.id,
  layerId: ctx.layerId,
  position: ctx.position,
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: ctx.order,
});

const filledRect = (ctx: TemplateContext, width: number, height: number, style: Style): Element => ({
  ...baseElement(ctx),
  type: "rectangle",
  style,
  width,
  height,
});

const filledEllipse = (
  ctx: TemplateContext,
  width: number,
  height: number,
  style: Style,
): Element => ({ ...baseElement(ctx), type: "ellipse", style, width, height });

const polygonFromPoints = (ctx: TemplateContext, points: Vec2[], style: Style): Element => ({
  ...baseElement(ctx),
  type: "polygon",
  style,
  points,
});

// --- Default styles ---
// Sourced from `@oh-just-another/tokens` so palette changes propagate
// across every built-in template in one place.

const BASIC_STYLE: Style = { ...DEFAULT_SHAPE_STYLES.rectangle };
const STICKY_STYLE: Style = { ...DEFAULT_SHAPE_STYLES.sticky };
const FLOW_STYLE: Style = { ...DEFAULT_SHAPE_STYLES.flowchart };

// --- Built-in templates ---

export const BUILTIN_TEMPLATES: readonly Template[] = [
  // --- basic ---
  {
    id: "basic.rectangle",
    name: "Rectangle",
    category: "basic",
    icon: RECT_ICON,
    tags: ["rectangle", "rect", "square", "box", "block"],
    factory: (c) => filledRect(c, 140, 80, BASIC_STYLE),
  },
  {
    id: "basic.ellipse",
    name: "Ellipse",
    category: "basic",
    icon: ELLIPSE_ICON,
    tags: ["ellipse", "circle", "oval", "round", "disc"],
    factory: (c) => filledEllipse(c, 140, 80, BASIC_STYLE),
  },
  {
    id: "basic.triangle",
    name: "Triangle",
    category: "basic",
    icon: TRIANGLE_ICON,
    tags: ["triangle", "play", "arrow"],
    factory: (c) =>
      polygonFromPoints(
        c,
        [
          { x: 70, y: 0 },
          { x: 140, y: 120 },
          { x: 0, y: 120 },
        ],
        BASIC_STYLE,
      ),
  },
  {
    id: "basic.diamond",
    name: "Diamond",
    category: "basic",
    icon: DIAMOND_ICON,
    tags: ["diamond", "rhombus", "kite"],
    factory: (c) =>
      polygonFromPoints(
        c,
        [
          { x: 70, y: 0 },
          { x: 140, y: 50 },
          { x: 70, y: 100 },
          { x: 0, y: 50 },
        ],
        BASIC_STYLE,
      ),
  },
  {
    id: "basic.hexagon",
    name: "Hexagon",
    category: "basic",
    icon: HEXAGON_ICON,
    tags: ["hexagon", "hex", "polygon", "honeycomb"],
    factory: (c) =>
      polygonFromPoints(
        c,
        [
          { x: 35, y: 0 },
          { x: 105, y: 0 },
          { x: 140, y: 50 },
          { x: 105, y: 100 },
          { x: 35, y: 100 },
          { x: 0, y: 50 },
        ],
        BASIC_STYLE,
      ),
  },
  {
    id: "basic.sticky-note",
    name: "Sticky note",
    category: "basic",
    icon: STICKY_ICON,
    tags: ["sticky", "note", "postit", "post-it", "memo", "card"],
    factory: (c) => filledRect(c, 120, 100, STICKY_STYLE),
  },

  // --- flowchart ---
  {
    id: "flowchart.process",
    name: "Process",
    category: "flowchart",
    icon: PROCESS_ICON,
    tags: ["process", "action", "step", "task", "rectangle"],
    factory: (c) => filledRect(c, 160, 70, FLOW_STYLE),
  },
  {
    id: "flowchart.decision",
    name: "Decision",
    category: "flowchart",
    icon: DECISION_ICON,
    tags: ["decision", "branch", "if", "condition", "diamond", "choice"],
    factory: (c) =>
      polygonFromPoints(
        c,
        [
          { x: 70, y: 0 },
          { x: 140, y: 50 },
          { x: 70, y: 100 },
          { x: 0, y: 50 },
        ],
        FLOW_STYLE,
      ),
  },
  {
    id: "flowchart.terminator",
    name: "Terminator",
    category: "flowchart",
    icon: TERMINATOR_ICON,
    tags: ["terminator", "start", "end", "stop", "begin", "finish", "pill"],
    factory: (c) => filledEllipse(c, 140, 60, FLOW_STYLE),
  },
  {
    id: "flowchart.document",
    name: "Document",
    category: "flowchart",
    icon: DOCUMENT_ICON,
    tags: ["document", "file", "report", "paper", "doc"],
    factory: (c) => {
      const w = 160;
      const h = 90;
      const wave = 18;
      return {
        ...baseElement(c),
        type: "path",
        style: FLOW_STYLE,
        commands: [
          { kind: "M", to: { x: 0, y: 0 } },
          { kind: "L", to: { x: w, y: 0 } },
          { kind: "L", to: { x: w, y: h - wave } },
          {
            kind: "Q",
            control: { x: (w * 3) / 4, y: h - wave * 2 },
            to: { x: w / 2, y: h - wave },
          },
          { kind: "Q", control: { x: w / 4, y: h }, to: { x: 0, y: h - wave } },
          { kind: "Z" },
        ],
      };
    },
  },
  {
    id: "flowchart.data",
    name: "Data",
    category: "flowchart",
    icon: DATA_ICON,
    tags: ["data", "input", "output", "io", "parallelogram"],
    factory: (c) =>
      polygonFromPoints(
        c,
        [
          { x: 30, y: 0 },
          { x: 160, y: 0 },
          { x: 130, y: 80 },
          { x: 0, y: 80 },
        ],
        FLOW_STYLE,
      ),
  },
];

/**
 * Match a template against a search query: case-insensitive substring
 * over `name`, `category`, and `tags`. Returns `true` when the query
 * is empty (no filter) or any matchable field contains it.
 */
export const matchesTemplateSearch = (template: Template, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (template.name.toLowerCase().includes(q)) return true;
  if (typeof template.category === "string" && template.category.toLowerCase().includes(q))
    return true;
  if (template.tags) {
    for (const tag of template.tags) {
      if (tag.toLowerCase().includes(q)) return true;
    }
  }
  return false;
};

/**
 * Register the full built-in set into a registry (defaults to the singleton).
 * Idempotent only across distinct registries — registering the same set twice
 * on one registry triggers a duplicate-id error by design.
 */
export const installBuiltinTemplates = (registry: TemplateRegistry = defaultRegistry): void => {
  for (const t of BUILTIN_TEMPLATES) {
    registry.register(t);
  }
};
