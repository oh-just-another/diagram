import type { Shape, Style } from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";
import {
  ARROW_ICON,
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
} from "./icons";
import { defaultRegistry, type TemplateRegistry } from "./registry";
import type { Template, TemplateContext } from "./types";

// --- Local helpers ---

const baseShape = (ctx: TemplateContext) => ({
  id: ctx.id,
  layerId: ctx.layerId,
  position: ctx.position,
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: ctx.order,
});

const filledRect = (ctx: TemplateContext, width: number, height: number, style: Style): Shape => ({
  ...baseShape(ctx),
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
): Shape => ({ ...baseShape(ctx), type: "ellipse", style, width, height });

const polygonFromPoints = (ctx: TemplateContext, points: Vec2[], style: Style): Shape => ({
  ...baseShape(ctx),
  type: "polygon",
  style,
  points,
});

// --- Default styles ---

const BASIC_STYLE: Style = {
  fill: "#cfe1ff",
  stroke: "#1a40b0",
  strokeWidth: 2,
};
const STICKY_STYLE: Style = {
  fill: "#fff2a8",
  stroke: "#b18a00",
  strokeWidth: 1,
};
const FLOW_STYLE: Style = {
  fill: "#e6ffe6",
  stroke: "#2f7a2f",
  strokeWidth: 2,
};

// --- Built-in templates ---

export const BUILTIN_TEMPLATES: readonly Template[] = [
  // --- basic ---
  {
    id: "basic.rectangle",
    name: "Rectangle",
    category: "basic",
    icon: RECT_ICON,
    factory: (c) => filledRect(c, 140, 80, BASIC_STYLE),
  },
  {
    id: "basic.ellipse",
    name: "Ellipse",
    category: "basic",
    icon: ELLIPSE_ICON,
    factory: (c) => filledEllipse(c, 140, 80, BASIC_STYLE),
  },
  {
    id: "basic.triangle",
    name: "Triangle",
    category: "basic",
    icon: TRIANGLE_ICON,
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
    id: "basic.arrow",
    name: "Arrow",
    category: "basic",
    icon: ARROW_ICON,
    factory: (c) =>
      polygonFromPoints(
        c,
        [
          { x: 0, y: 30 },
          { x: 90, y: 30 },
          { x: 90, y: 15 },
          { x: 140, y: 50 },
          { x: 90, y: 85 },
          { x: 90, y: 70 },
          { x: 0, y: 70 },
        ],
        BASIC_STYLE,
      ),
  },
  {
    id: "basic.sticky-note",
    name: "Sticky note",
    category: "basic",
    icon: STICKY_ICON,
    factory: (c) => filledRect(c, 120, 100, STICKY_STYLE),
  },

  // --- flowchart ---
  {
    id: "flowchart.process",
    name: "Process",
    category: "flowchart",
    icon: PROCESS_ICON,
    factory: (c) => filledRect(c, 160, 70, FLOW_STYLE),
  },
  {
    id: "flowchart.decision",
    name: "Decision",
    category: "flowchart",
    icon: DECISION_ICON,
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
    factory: (c) => filledEllipse(c, 140, 60, FLOW_STYLE),
  },
  {
    id: "flowchart.document",
    name: "Document",
    category: "flowchart",
    icon: DOCUMENT_ICON,
    factory: (c) => {
      const w = 160;
      const h = 90;
      const wave = 18;
      return {
        ...baseShape(c),
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
 * Register the full built-in set into a registry (defaults to the singleton).
 * Idempotent only across distinct registries — registering the same set twice
 * on one registry triggers a duplicate-id error by design.
 */
export const installBuiltinTemplates = (registry: TemplateRegistry = defaultRegistry): void => {
  for (const t of BUILTIN_TEMPLATES) {
    registry.register(t);
  }
};
