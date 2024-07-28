import type { Bounds, Color, Vec2 } from "@oh-just-another/types";
import { registerBounder, type TemplateShape as SceneTemplateShape } from "@oh-just-another/scene";
import {
  registerShapeRenderer,
  type RenderTarget,
  type ShapeRenderer,
} from "@oh-just-another/renderer-core";
import { resolveBindings } from "./binding.js";
import { layoutTree, type LayoutedNode, type MeasureText } from "./layout.js";
import type {
  ButtonNode,
  ContainerNode,
  DropZoneNode,
  IconNode,
  ImageNode,
  TextNode,
  TemplateNode,
} from "./node.js";
import { defaultRichRegistry } from "./registry.js";
import type { NodeStyle } from "./style.js";
import { paintSvgIcon, parseSvg } from "./svg.js";

/**
 * Render a `TemplateShape` onto a `RenderTarget`. The renderer:
 *   1. looks up the template in the rich registry by `shape.templateId`,
 *   2. resolves data bindings against `shape.data`,
 *   3. runs the layout engine with a measurer backed by `target.measureText`,
 *   4. walks the layouted tree and paints each node into `target`.
 *
 * The caller is expected to have already translated `target` to the shape's
 * `position` (via `renderScene`'s per-shape TRS push).
 */
export const renderTemplateShape: ShapeRenderer<SceneTemplateShape> = (shape, target) => {
  const template = defaultRichRegistry.get(shape.templateId);
  if (!template) {
    paintMissing(target, shape.width, shape.height, shape.templateId);
    return;
  }

  const root = resolveBindings(template.root, { ...template.defaults, ...shape.data });
  // Force the root to fill the shape's box, which is what makes a template
  // resizable: the user-defined `width/height` on the root layout are
  // overridden with the shape's current width/height so the layout engine
  // distributes the remaining space to children.
  const rootWithSize: TemplateNode = {
    ...root,
    layout: {
      ...(root.layout ?? {}),
      width: shape.width,
      height: shape.height,
    },
  };
  const measure = makeMeasureText(target);
  const layouted = layoutTree(rootWithSize, {
    measureText: measure,
    available: { width: shape.width, height: shape.height },
  });
  paintNode(layouted, target);
};

const makeMeasureText = (target: RenderTarget): MeasureText => {
  // measureText reads the current font on the target. Set/restore around the
  // measurement so the caller's style is not stomped on.
  return (text, fontFamily, fontSize) => {
    target.save();
    try {
      target.setFont(fontFamily, fontSize);
      return target.measureText(text).width;
    } finally {
      target.restore();
    }
  };
};

const paintNode = (l: LayoutedNode, target: RenderTarget): void => {
  paintBox(l.node, l.bounds, target);
  switch (l.node.type) {
    case "container":
      for (const c of l.children) paintNode(c, target);
      break;
    case "text":
      paintText(l.node, l.bounds, target);
      break;
    case "button":
      paintButton(l.node, l.bounds, target);
      break;
    case "drop-zone":
      paintDropZone(l.node, l.bounds, target);
      break;
    case "icon":
      paintIcon(l.node, l.bounds, target);
      break;
    case "image":
      paintImagePlaceholder(l.node, l.bounds, target);
      break;
  }
};

const paintBox = (node: TemplateNode, b: Bounds, target: RenderTarget): void => {
  const style = node.style;
  if (!style) return;
  const hasFill = style.fill !== undefined && style.fill !== "transparent";
  const hasStroke =
    style.stroke !== undefined && style.stroke !== "transparent" && (style.strokeWidth ?? 1) > 0;
  if (!hasFill && !hasStroke) return;

  if (style.opacity !== undefined) target.setOpacity(style.opacity);
  if (hasFill && style.fill !== undefined) target.setFill(style.fill);
  if (hasStroke && style.stroke !== undefined) {
    target.setStroke(style.stroke);
    target.setStrokeWidth(style.strokeWidth ?? 1);
  }
  target.beginPath();
  target.rect(b.x, b.y, b.width, b.height);
  if (hasFill) target.fill();
  if (hasStroke) target.stroke();
};

const paintText = (node: TextNode, b: Bounds, target: RenderTarget): void => {
  const color = node.style?.color ?? node.style?.fill ?? "#000";
  const fontFamily = node.style?.fontFamily ?? "system-ui, sans-serif";
  const fontSize = node.style?.fontSize ?? 14;
  const align = node.style?.textAlign ?? "left";
  target.setFont(fontFamily, fontSize);
  target.setTextAlign(align);
  target.setTextBaseline("top");
  target.setFill(color);
  const raw = typeof node.text === "string" ? node.text : "";
  const text = truncateToWidth(raw, b.width, target);
  // X anchor for alignment within the box.
  let x = b.x;
  if (align === "center") x = b.x + b.width / 2;
  else if (align === "right") x = b.x + b.width;
  target.fillText(text, x, b.y);
};

const paintButton = (node: ButtonNode, b: Bounds, target: RenderTarget): void => {
  const fill = node.style?.fill ?? "#f4f4f4";
  const stroke = node.style?.stroke ?? "#888";
  const color = node.style?.color ?? "#222";
  target.setFill(fill);
  target.setStroke(stroke);
  target.setStrokeWidth(node.style?.strokeWidth ?? 1);
  target.beginPath();
  target.rect(b.x, b.y, b.width, b.height);
  target.fill();
  target.stroke();
  if (node.label !== undefined) {
    const rawLabel = typeof node.label === "string" ? node.label : "";
    const fontFamily = node.style?.fontFamily ?? "system-ui, sans-serif";
    const fontSize = node.style?.fontSize ?? 13;
    target.setFont(fontFamily, fontSize);
    target.setTextAlign("center");
    target.setTextBaseline("middle");
    target.setFill(color);
    const labelText = truncateToWidth(rawLabel, Math.max(0, b.width - 12), target);
    target.fillText(labelText, b.x + b.width / 2, b.y + b.height / 2);
  }
};

const paintDropZone = (node: DropZoneNode, b: Bounds, target: RenderTarget): void => {
  target.setStroke(node.style?.stroke ?? "#888");
  target.setStrokeWidth(node.style?.strokeWidth ?? 1);
  target.setDashArray([4, 4]);
  target.beginPath();
  target.rect(b.x, b.y, b.width, b.height);
  target.stroke();
  target.setDashArray(null);
  if (node.label !== undefined) {
    const labelText = typeof node.label === "string" ? node.label : "Drop here";
    const color = node.style?.color ?? "#999";
    target.setFont(node.style?.fontFamily ?? "system-ui", node.style?.fontSize ?? 12);
    target.setTextAlign("center");
    target.setTextBaseline("middle");
    target.setFill(color);
    target.fillText(labelText, b.x + b.width / 2, b.y + b.height / 2);
  }
};

const paintIcon = (node: IconNode, b: Bounds, target: RenderTarget): void => {
  const svg = typeof node.svg === "string" ? node.svg : "";
  if (!svg) return;
  const tint = node.style?.color ?? node.style?.stroke ?? node.style?.fill ?? "#222";
  const cached = getCachedSvg(svg, tint);
  if (!cached) {
    // Couldn't parse — fall back to a hairline placeholder so the layout
    // slot still shows.
    target.setStroke(tint);
    target.setStrokeWidth(1);
    target.beginPath();
    target.rect(b.x, b.y, b.width, b.height);
    target.stroke();
    return;
  }
  paintSvgIcon(cached, b, target);
};

// Parsed-SVG cache keyed by `markup|tint`. SVG strings in templates are
// repeated for every instance — parse once, reuse.
const svgCache = new Map<string, ReturnType<typeof parseSvg>>();
const getCachedSvg = (markup: string, tint: string) => {
  const key = `${markup}|${tint}`;
  if (svgCache.has(key)) return svgCache.get(key) ?? null;
  const parsed = parseSvg(markup, tint);
  svgCache.set(key, parsed);
  return parsed;
};

const paintImagePlaceholder = (_node: ImageNode, b: Bounds, target: RenderTarget): void => {
  target.setStroke("#888");
  target.setStrokeWidth(1);
  target.setFill("#eee");
  target.beginPath();
  target.rect(b.x, b.y, b.width, b.height);
  target.fill();
  target.stroke();
};

/**
 * Truncate `text` with a trailing `…` so the painted run fits within
 * `maxWidth`. Reads the target's current font (the caller is expected to
 * have set it).
 */
const truncateToWidth = (text: string, maxWidth: number, target: RenderTarget): string => {
  if (maxWidth <= 0) return "";
  if (target.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (target.measureText(ellipsis).width > maxWidth) return "";
  let lo = 0;
  let hi = text.length;
  // Largest prefix that, plus the ellipsis, still fits.
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    const candidate = text.slice(0, mid) + ellipsis;
    if (target.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
};

const paintMissing = (target: RenderTarget, width: number, height: number, id: string): void => {
  target.setStroke("#c00");
  target.setStrokeWidth(1);
  target.setDashArray([4, 4]);
  target.beginPath();
  target.rect(0, 0, width, height);
  target.stroke();
  target.setDashArray(null);
  target.setFill("#c00");
  target.setFont("system-ui", 11);
  target.setTextAlign("center");
  target.setTextBaseline("middle");
  target.fillText(`missing template: ${id}`, width / 2, height / 2);
};

void (null as unknown as ContainerNode | Color | Vec2 | NodeStyle); // appease unused-import checks

/**
 * Wire the rich-template renderer + bounder into the global registries. Call
 * once at app startup, alongside `installBuiltinRenderers()`.
 */
export const installTemplateShapeRenderer = (): void => {
  registerShapeRenderer<SceneTemplateShape>("template", renderTemplateShape);
  registerBounder<SceneTemplateShape>("template", (shape) => {
    // The shape's width/height drives both the bounder and the renderer so
    // the user's resize gesture changes both the AABB and the painted layout.
    return { x: 0, y: 0, width: shape.width, height: shape.height };
  });
};
