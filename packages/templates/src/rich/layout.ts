import { req, type Bounds } from "@oh-just-another/types";
import {
  isContainer,
  type ButtonNode,
  type ContainerNode,
  type DropZoneNode,
  type IconNode,
  type ImageNode,
  type TemplateNode,
  type TextNode,
} from "./node.js";
import {
  resolveSpacing,
  resolveSpotRatio,
  type LayoutStyle,
  type Length,
  type Position,
} from "./style.js";

/**
 * `MeasureText(text, fontFamily, fontSize)` returns the rendered width of the
 * given text run in CSS pixels. The layout engine relies on this for
 * intrinsic sizing of `Text` and `Button` (label) nodes.
 *
 * The renderer passes a function backed by `CanvasRenderingContext2D.measureText`;
 * tests can supply a deterministic mock.
 */
export type MeasureText = (text: string, fontFamily: string, fontSize: number) => number;

/** Best-effort defaults when the host doesn't supply a measurer. */
export const fallbackMeasureText: MeasureText = (text, _fontFamily, fontSize) =>
  text.length * fontSize * 0.55;

const DEFAULT_FONT_FAMILY = "system-ui, sans-serif";
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_LINE_HEIGHT = 1.2;

/** A node augmented with its computed bounds in template-local coordinates. */
export interface LayoutedNode {
  readonly node: TemplateNode;
  /** Computed bounds in the template's local coordinate space. */
  readonly bounds: Bounds;
  readonly children: readonly LayoutedNode[];
}

export interface LayoutOptions {
  readonly measureText?: MeasureText;
  /** Maximum bounds the root may occupy. Defaults to (∞, ∞). */
  readonly available?: { readonly width: number; readonly height: number };
}

/**
 * Compute a layout for the entire tree. The root is positioned at (0, 0); the
 * caller is responsible for translating it to the shape's world position when
 * rendering.
 *
 * Algorithm:
 *   1. Recursively measure intrinsic size for every node bottom-up.
 *      Containers ask their (in-flow) children for sizes then compute their
 *      own from `width/height` or by summing children + padding + gap.
 *   2. Position children top-down using `flexDirection`, `justifyContent`,
 *      `alignItems`, `gap`, and `flex` grow factor.
 *   3. Absolutely-positioned children are layouted independently inside the
 *      parent's padding box, using `top/left/right/bottom` against the parent.
 */
export const layoutTree = (root: TemplateNode, options: LayoutOptions = {}): LayoutedNode => {
  const measure = options.measureText ?? fallbackMeasureText;
  const available = options.available ?? { width: Infinity, height: Infinity };
  // Measure pass.
  const intrinsic = measureNode(
    root,
    { width: available.width, height: available.height },
    measure,
  );
  // Position pass: root occupies its intrinsic size at (0, 0).
  return positionNode(
    root,
    { x: 0, y: 0, width: intrinsic.width, height: intrinsic.height },
    measure,
  );
};

// --- Intrinsic measurement ---

interface Size {
  readonly width: number;
  readonly height: number;
}

const measureNode = (node: TemplateNode, available: Size, measure: MeasureText): Size => {
  const layout = node.layout ?? {};

  // Absolute sizing wins if both axes are given as numbers.
  const fixedW = lengthToPx(layout.width, available.width);
  const fixedH = lengthToPx(layout.height, available.height);
  if (fixedW !== undefined && fixedH !== undefined) {
    return clampSize({ width: fixedW, height: fixedH }, layout);
  }

  let intrinsic: Size;
  switch (node.type) {
    case "container":
      intrinsic = measureContainer(node, sizeMinus(available, marginOf(layout)), measure);
      break;
    case "text":
      intrinsic = measureText(node, available, measure);
      break;
    case "icon":
    case "image":
      intrinsic = { width: 24, height: 24 };
      break;
    case "button":
      intrinsic = measureButton(node, available, measure);
      break;
    case "drop-zone":
      intrinsic = { width: 80, height: 60 };
      break;
    case "port":
      // Ports are dimensionless — they collapse to a 0×0 point at their
      // computed position. The host paints the port-dot overlay from
      // `shape.anchors`, not from the template tree.
      intrinsic = { width: 0, height: 0 };
      break;
  }

  return clampSize(
    {
      width: fixedW ?? intrinsic.width,
      height: fixedH ?? intrinsic.height,
    },
    layout,
  );
};

const measureContainer = (node: ContainerNode, available: Size, measure: MeasureText): Size => {
  const layout = node.layout ?? {};
  const padding = resolveSpacing(layout.padding);
  const direction = layout.flexDirection ?? "row";
  const gap = layout.gap ?? 0;

  const inFlow = (node.children ?? []).filter(
    (c) => (c.layout?.position ?? "relative") !== "absolute",
  );

  let mainContent = 0;
  let crossContent = 0;

  const innerAvail = {
    width: available.width - padding.left - padding.right,
    height: available.height - padding.top - padding.bottom,
  };

  for (let i = 0; i < inFlow.length; i++) {
    const child = req(inFlow[i]);
    const childMargin = marginOf(child.layout ?? {});
    const childSize = measureNode(child, innerAvail, measure);
    const childWithMarginMain =
      (direction === "row" ? childSize.width : childSize.height) +
      (direction === "row"
        ? childMargin.left + childMargin.right
        : childMargin.top + childMargin.bottom);
    const childWithMarginCross =
      (direction === "row" ? childSize.height : childSize.width) +
      (direction === "row"
        ? childMargin.top + childMargin.bottom
        : childMargin.left + childMargin.right);
    mainContent += childWithMarginMain;
    if (i > 0) mainContent += gap;
    if (childWithMarginCross > crossContent) crossContent = childWithMarginCross;
  }

  if (direction === "row") {
    return {
      width: mainContent + padding.left + padding.right,
      height: crossContent + padding.top + padding.bottom,
    };
  }
  return {
    width: crossContent + padding.left + padding.right,
    height: mainContent + padding.top + padding.bottom,
  };
};

const measureText = (node: TextNode, available: Size, measure: MeasureText): Size => {
  const text = typeof node.text === "string" ? node.text : "";
  const fontFamily = node.style?.fontFamily ?? DEFAULT_FONT_FAMILY;
  const fontSize = node.style?.fontSize ?? DEFAULT_FONT_SIZE;
  const intrinsic = measure(text, fontFamily, fontSize);
  // Cap by available width — the renderer will paint with ellipsis when the
  // string doesn't fit. Without this cap a long label would push siblings
  // outside the container.
  return {
    width: Math.min(intrinsic, available.width),
    height: fontSize * DEFAULT_LINE_HEIGHT,
  };
};

const measureButton = (node: ButtonNode, available: Size, measure: MeasureText): Size => {
  const labelText = typeof node.label === "string" ? node.label : "";
  const fontFamily = node.style?.fontFamily ?? DEFAULT_FONT_FAMILY;
  const fontSize = node.style?.fontSize ?? DEFAULT_FONT_SIZE;
  const padX = 10;
  const padY = 6;
  const labelW = measure(labelText, fontFamily, fontSize);
  const intrinsicW = labelW + padX * 2;
  return {
    width: Math.min(intrinsicW, available.width),
    height: fontSize * DEFAULT_LINE_HEIGHT + padY * 2,
  };
};

// --- Position pass ---

const positionNode = (node: TemplateNode, bounds: Bounds, measure: MeasureText): LayoutedNode => {
  if (!isContainer(node)) {
    return { node, bounds, children: [] };
  }
  const layout = node.layout ?? {};
  const padding = resolveSpacing(layout.padding);
  const direction = layout.flexDirection ?? "row";
  const wrap = (layout.flexWrap ?? "nowrap") === "wrap";
  const gap = layout.gap ?? 0;

  const inner: Bounds = {
    x: bounds.x + padding.left,
    y: bounds.y + padding.top,
    width: Math.max(0, bounds.width - padding.left - padding.right),
    height: Math.max(0, bounds.height - padding.top - padding.bottom),
  };

  const children: LayoutedNode[] = [];
  const allChildren = node.children ?? [];

  const positionOf = (c: TemplateNode): Position => c.layout?.position ?? "relative";
  const inFlow = allChildren.filter((c) => positionOf(c) === "relative");
  const absolute = allChildren.filter((c) => positionOf(c) === "absolute");
  const spot = allChildren.filter((c) => positionOf(c) === "spot");

  const sized: SizedChild[] = inFlow.map((c) => ({
    node: c,
    baseSize: measureNode(c, { width: inner.width, height: inner.height }, measure),
    flexGrow: c.layout?.flex ?? 0,
    margin: marginOf(c.layout ?? {}),
  }));

  // Split children into lines. With `flexWrap: "wrap"`, push children onto a
  // new line whenever the in-progress one would overflow along the main axis.
  // Without wrapping (default) everything goes on a single line.
  const lines: SizedChild[][] = [];
  if (!wrap || sized.length === 0) {
    lines.push(sized);
  } else {
    const availMain = direction === "row" ? inner.width : inner.height;
    let current: SizedChild[] = [];
    let currentSize = 0;
    for (const c of sized) {
      const childMain =
        direction === "row"
          ? c.baseSize.width + c.margin.left + c.margin.right
          : c.baseSize.height + c.margin.top + c.margin.bottom;
      const projected = current.length === 0 ? childMain : currentSize + gap + childMain;
      if (current.length > 0 && projected > availMain) {
        lines.push(current);
        current = [c];
        currentSize = childMain;
      } else {
        current.push(c);
        currentSize = projected;
      }
    }
    if (current.length > 0) lines.push(current);
  }

  // Compute per-line cross size (max child cross) plus the total cross size.
  const lineCrossSizes = lines.map((line) =>
    line.reduce((acc, c) => {
      const cross =
        direction === "row"
          ? c.baseSize.height + c.margin.top + c.margin.bottom
          : c.baseSize.width + c.margin.left + c.margin.right;
      return Math.max(acc, cross);
    }, 0),
  );
  const totalCross =
    lineCrossSizes.reduce((acc, h) => acc + h, 0) + Math.max(0, lines.length - 1) * gap;

  // When wrap = true, lines are laid top-to-bottom inside `inner`. When wrap =
  // false there's a single line that takes the full cross axis.
  let lineCursorCross = direction === "row" ? inner.y : inner.x;
  if (wrap && lines.length > 1) {
    // Distribute extra cross space at the start (no align-content support).
    void totalCross;
  }

  // Place each line individually.
  for (let li = 0; li < lines.length; li++) {
    const line = req(lines[li]);
    const lineCross = wrap
      ? (lineCrossSizes[li] ?? 0)
      : direction === "row"
        ? inner.height
        : inner.width;
    const lineBounds: Bounds =
      direction === "row"
        ? { x: inner.x, y: lineCursorCross, width: inner.width, height: lineCross }
        : { x: lineCursorCross, y: inner.y, width: lineCross, height: inner.height };

    placeLine(node, line, lineBounds, direction, layout, measure, children);

    lineCursorCross += lineCross + gap;
  }

  // Place absolute children inside `inner` using top/left/right/bottom.
  for (const child of absolute) {
    const cLayout = child.layout ?? {};
    const childSize = measureNode(child, { width: inner.width, height: inner.height }, measure);
    let x = inner.x;
    let y = inner.y;
    let width = childSize.width;
    let height = childSize.height;
    if (cLayout.left !== undefined) x = inner.x + cLayout.left;
    if (cLayout.top !== undefined) y = inner.y + cLayout.top;
    if (cLayout.right !== undefined) {
      if (cLayout.left === undefined) x = inner.x + inner.width - cLayout.right - width;
      else width = inner.width - cLayout.left - cLayout.right;
    }
    if (cLayout.bottom !== undefined) {
      if (cLayout.top === undefined) y = inner.y + inner.height - cLayout.bottom - height;
      else height = inner.height - cLayout.top - cLayout.bottom;
    }
    children.push(positionNode(child, { x, y, width, height }, measure));
  }

  // Spot-positioned children: pin the child's `anchorFocus` to the parent's
  // `anchor`, then apply `offset`:
  // parentAnchorPoint - childFocusOffset + offset = child top-left.
  for (const child of spot) {
    const cLayout = child.layout ?? {};
    const childSize = measureNode(child, { width: inner.width, height: inner.height }, measure);
    const parentAnchor = resolveSpotRatio(cLayout.anchor ?? "center");
    const childFocus = resolveSpotRatio(cLayout.anchorFocus ?? "center");
    const offset = cLayout.offset ?? { x: 0, y: 0 };
    const x = inner.x + inner.width * parentAnchor.x - childSize.width * childFocus.x + offset.x;
    const y = inner.y + inner.height * parentAnchor.y - childSize.height * childFocus.y + offset.y;
    children.push(
      positionNode(child, { x, y, width: childSize.width, height: childSize.height }, measure),
    );
  }

  return { node, bounds, children };
};

// --- Per-line placement ---

interface SizedChild {
  node: TemplateNode;
  baseSize: Size;
  flexGrow: number;
  margin: ReturnType<typeof marginOf>;
}

const placeLine = (
  parent: TemplateNode,
  line: readonly SizedChild[],
  lineBounds: Bounds,
  direction: "row" | "column",
  parentLayout: LayoutStyle,
  measure: MeasureText,
  out: LayoutedNode[],
): void => {
  void parent;
  if (line.length === 0) return;
  const justify = parentLayout.justifyContent ?? "start";
  const align = parentLayout.alignItems ?? "stretch";
  const gap = parentLayout.gap ?? 0;

  // Sum base size + gap to compute leftover along main axis for this line.
  const availMain = direction === "row" ? lineBounds.width : lineBounds.height;
  let usedMain = 0;
  for (let i = 0; i < line.length; i++) {
    const c = req(line[i]);
    usedMain +=
      direction === "row"
        ? c.baseSize.width + c.margin.left + c.margin.right
        : c.baseSize.height + c.margin.top + c.margin.bottom;
    if (i > 0) usedMain += gap;
  }
  const leftover = Math.max(0, availMain - usedMain);
  const totalFlex = line.reduce((acc, c) => acc + c.flexGrow, 0);

  let mainCursor = direction === "row" ? lineBounds.x : lineBounds.y;
  let gapBetween = gap;
  if (totalFlex === 0) {
    switch (justify) {
      case "center":
        mainCursor += leftover / 2;
        break;
      case "end":
        mainCursor += leftover;
        break;
      case "space-between":
        if (line.length > 1) gapBetween = gap + leftover / (line.length - 1);
        break;
      case "space-around":
        mainCursor += leftover / line.length / 2;
        gapBetween = gap + leftover / line.length;
        break;
      case "start":
      default:
        break;
    }
  }

  // Baseline: for `row` lines, find the strongest text-baseline among the
  // line's text/button children so all "baseline"-aligned siblings line up.
  const lineBaseline = direction === "row" ? lineBaselineY(line, lineBounds.y) : null;

  for (let i = 0; i < line.length; i++) {
    const c = req(line[i]);
    const grow = totalFlex > 0 ? (c.flexGrow / totalFlex) * leftover : 0;
    const mainSize = (direction === "row" ? c.baseSize.width : c.baseSize.height) + grow;
    const alignSelf = c.node.layout?.alignSelf ?? align;
    const crossAvail = direction === "row" ? lineBounds.height : lineBounds.width;
    const childMarginCrossStart = direction === "row" ? c.margin.top : c.margin.left;
    const childMarginCrossEnd = direction === "row" ? c.margin.bottom : c.margin.right;

    let crossSize: number;
    if (alignSelf === "stretch") {
      crossSize = crossAvail - childMarginCrossStart - childMarginCrossEnd;
    } else {
      crossSize = direction === "row" ? c.baseSize.height : c.baseSize.width;
    }

    let crossOffset = childMarginCrossStart;
    if (alignSelf === "center") {
      crossOffset = (crossAvail - crossSize - childMarginCrossStart - childMarginCrossEnd) / 2;
    } else if (alignSelf === "end") {
      crossOffset = crossAvail - crossSize - childMarginCrossEnd;
    } else if (alignSelf === "baseline" && direction === "row" && lineBaseline !== null) {
      // Place the node so its baseline matches the line baseline.
      const childBaselineFromTop = nodeBaselineOffset(c.node);
      const targetY = lineBaseline - childBaselineFromTop;
      crossOffset = targetY - lineBounds.y;
    }

    const cursorStart = mainCursor + (direction === "row" ? c.margin.left : c.margin.top);
    const childBounds: Bounds =
      direction === "row"
        ? { x: cursorStart, y: lineBounds.y + crossOffset, width: mainSize, height: crossSize }
        : { x: lineBounds.x + crossOffset, y: cursorStart, width: crossSize, height: mainSize };

    out.push(positionNode(c.node, childBounds, measure));

    mainCursor +=
      mainSize +
      (direction === "row" ? c.margin.left + c.margin.right : c.margin.top + c.margin.bottom);
    if (i < line.length - 1) mainCursor += gapBetween;
  }
};

/**
 * Approximate font baseline offset from the node's top edge. Uses 0.8 ×
 * font-size as a rough ascent — accurate enough for editor templates without
 * pulling in real font-metric tables. Non-text nodes report their own
 * bottom edge as the baseline (matches CSS for replaced elements).
 */
const nodeBaselineOffset = (node: TemplateNode): number => {
  if (node.type === "text") {
    const fontSize = node.style?.fontSize ?? DEFAULT_FONT_SIZE;
    return fontSize * 0.8;
  }
  if (node.type === "button") {
    const fontSize = node.style?.fontSize ?? DEFAULT_FONT_SIZE;
    // Buttons render their label centered vertically — baseline ≈ vertical
    // center + half-ascent.
    return fontSize * 0.8 + 6; // mirrors paintButton's padY
  }
  return Infinity; // non-text: ignored when reducing the line baseline.
};

const lineBaselineY = (line: readonly SizedChild[], lineY: number): number | null => {
  let best: number | null = null;
  for (const c of line) {
    const offset = nodeBaselineOffset(c.node);
    if (!Number.isFinite(offset)) continue;
    const y = lineY + c.margin.top + offset;
    if (best === null || y > best) best = y;
  }
  return best;
};

// --- Helpers ---

const lengthToPx = (l: Length | undefined, parent: number): number | undefined => {
  if (l === undefined || l === "auto") return undefined;
  if (typeof l === "number") return l;
  // `${number}%`
  const pct = parseFloat(l);
  if (Number.isFinite(pct) && Number.isFinite(parent)) return (pct / 100) * parent;
  return undefined;
};

const clampSize = (size: Size, layout: LayoutStyle): Size => {
  let w = size.width;
  let h = size.height;
  if (layout.minWidth !== undefined && w < layout.minWidth) w = layout.minWidth;
  if (layout.maxWidth !== undefined && w > layout.maxWidth) w = layout.maxWidth;
  if (layout.minHeight !== undefined && h < layout.minHeight) h = layout.minHeight;
  if (layout.maxHeight !== undefined && h > layout.maxHeight) h = layout.maxHeight;
  return { width: w, height: h };
};

const marginOf = (layout: LayoutStyle) => resolveSpacing(layout.margin);

const sizeMinus = (
  s: Size,
  margin: { top: number; right: number; bottom: number; left: number },
): Size => ({
  width: s.width - margin.left - margin.right,
  height: s.height - margin.top - margin.bottom,
});

// Quiet the unused-var checker for renderer-side variants.
void (null as unknown as IconNode | ImageNode | DropZoneNode);
