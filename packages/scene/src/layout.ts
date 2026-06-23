import { req, type ElementId, type Vec2 } from "@oh-just-another/types";
import { getDropZoneWorld } from "./container.js";
import type { Scene } from "./scene.js";
import { getElementLocalBounds, type Element } from "./shape.js";
import { getElement } from "./queries.js";
import { updateElement, type OperationResult } from "./operations.js";
import { batch, type Patch } from "./patch.js";
import { getLayoutKind } from "./layout-registry.js";
import { byOrderAsc } from "./order.js";

/**
 * Visual width / height of a shape in its OWN frame (no `position`,
 * yes `scale`). Uses the registered bounder so polygon / path /
 * freedraw shapes report their actual AABB — `shape.width` /
 * `shape.height` only exist on rectangle / ellipse / image / text
 * and reading them directly would return `undefined` for the
 * others, collapsing the layout stride to `0` and stacking every
 * polygon at the same point. Returns `(0, 0)` if no bounder is
 * registered for the type (kept defensive — the layout falls back
 * to gap-only spacing rather than throwing).
 */
const shapeAdvanceSize = (shape: Element): { width: number; height: number } => {
  try {
    const local = getElementLocalBounds(shape);
    return {
      width: local.width * Math.abs(shape.scale.x),
      height: local.height * Math.abs(shape.scale.y),
    };
  } catch {
    return { width: 0, height: 0 };
  }
};

/**
 * Pure layout function. Computes new positions for a subset of shapes
 * and returns a single batched patch (or null when nothing changed).
 *
 * Built-in layouts: `gridLayout`, `stackLayout`. Hosts can register
 * their own via the same signature; integrate with `Editor` through
 * a custom command.
 */
export interface LayoutSpec {
  readonly shapeIds: readonly ElementId[];
  readonly origin?: Vec2;
}

export type LayoutFn<S extends LayoutSpec = LayoutSpec> = (scene: Scene, spec: S) => Patch | null;

export interface GridLayoutSpec extends LayoutSpec {
  readonly cols: number;
  /** Cell gap, world units. */
  readonly gap?: number;
}

/**
 * Position shapes on a regular grid. Each cell size = max shape
 * width/height in its column/row + gap. Stable order: by `shape.order`.
 */
export const gridLayout: LayoutFn<GridLayoutSpec> = (scene, spec) => {
  if (spec.shapeIds.length === 0 || spec.cols < 1) return null;
  const gap = spec.gap ?? 16;
  const origin = spec.origin ?? { x: 0, y: 0 };
  const shapes: Element[] = [];
  for (const id of spec.shapeIds) {
    const s = getElement(scene, id);
    if (s) shapes.push(s);
  }
  shapes.sort(byOrderAsc);

  const sizes = shapes.map(shapeAdvanceSize);
  const cellW = sizes.reduce((m, s) => Math.max(m, s.width), 0);
  const cellH = sizes.reduce((m, s) => Math.max(m, s.height), 0);
  const stride = { x: cellW + gap, y: cellH + gap };

  const patches: Patch[] = [];
  let working = scene;
  shapes.forEach((shape, i) => {
    const col = i % spec.cols;
    const row = Math.floor(i / spec.cols);
    const target = { x: origin.x + col * stride.x, y: origin.y + row * stride.y };
    if (shape.position.x === target.x && shape.position.y === target.y) return;
    const r: OperationResult = updateElement(working, shape.id, (s) => ({
      ...s,
      position: target,
    }));
    working = r.scene;
    patches.push(r.patch);
  });
  if (patches.length === 0) return null;
  return batch(patches);
};

export interface StackLayoutSpec extends LayoutSpec {
  readonly direction: "horizontal" | "vertical";
  readonly gap?: number;
}

/** Position shapes top-to-bottom or left-to-right without wrapping. */
export const stackLayout: LayoutFn<StackLayoutSpec> = (scene, spec) => {
  if (spec.shapeIds.length === 0) return null;
  const gap = spec.gap ?? 16;
  const origin = spec.origin ?? { x: 0, y: 0 };
  const shapes: Element[] = [];
  for (const id of spec.shapeIds) {
    const s = getElement(scene, id);
    if (s) shapes.push(s);
  }
  shapes.sort(byOrderAsc);

  const patches: Patch[] = [];
  let working = scene;
  let cursor = { x: origin.x, y: origin.y };
  for (const shape of shapes) {
    const { width: w, height: h } = shapeAdvanceSize(shape);
    if (shape.position.x !== cursor.x || shape.position.y !== cursor.y) {
      const target = cursor;
      const r = updateElement(working, shape.id, (s) => ({ ...s, position: target }));
      working = r.scene;
      patches.push(r.patch);
    }
    if (spec.direction === "horizontal") cursor = { x: cursor.x + w + gap, y: cursor.y };
    else cursor = { x: cursor.x, y: cursor.y + h + gap };
  }
  if (patches.length === 0) return null;
  return batch(patches);
};

export interface WrapLayoutSpec extends LayoutSpec {
  /** Inner width to wrap within (the container's drop-zone width). */
  readonly innerWidth: number;
  readonly gap?: number;
}

interface WrapMeasure {
  /** Child placements (top-left), in input order. */
  readonly placements: readonly {
    readonly id: ElementId;
    readonly x: number;
    readonly y: number;
  }[];
  /** Widest single child — the minimum the container can ever be. */
  readonly widest: number;
  /** Width of the widest row (≤ innerWidth unless a child is wider). */
  readonly contentWidth: number;
  /** Total height of all rows (top of first row → bottom of last). */
  readonly contentHeight: number;
}

/**
 * Greedy flex-wrap packing (CSS `flex-wrap: wrap`, `inline-block` flow):
 * children keep their own size and flow left→right; the next child that would
 * overrun `innerWidth` starts a new row. Row height = tallest child in the row;
 * rows are top-aligned and stack downward. A child wider than `innerWidth` gets
 * its own row (overflows — that's what bounds the minimum width). Pure.
 */
const packWrap = (
  sizes: readonly { readonly id: ElementId; readonly w: number; readonly h: number }[],
  gap: number,
  innerWidth: number,
  origin: Vec2,
): WrapMeasure => {
  const placements: { id: ElementId; x: number; y: number }[] = [];
  let cursorX = origin.x;
  let cursorY = origin.y;
  let rowH = 0;
  let widest = 0;
  let maxRowW = 0;
  let firstInRow = true;
  for (const s of sizes) {
    widest = Math.max(widest, s.w);
    if (!firstInRow && cursorX - origin.x + s.w > innerWidth + 1e-6) {
      // Wrap: close the current row, start a new one below.
      maxRowW = Math.max(maxRowW, cursorX - gap - origin.x);
      cursorX = origin.x;
      cursorY += rowH + gap;
      rowH = 0;
      firstInRow = true;
    }
    placements.push({ id: s.id, x: cursorX, y: cursorY }); // top-aligned
    cursorX += s.w + gap;
    rowH = Math.max(rowH, s.h);
    firstInRow = false;
  }
  maxRowW = Math.max(maxRowW, cursorX - gap - origin.x);
  return {
    placements,
    widest,
    contentWidth: Math.max(0, maxRowW),
    contentHeight: cursorY + rowH - origin.y,
  };
};

/** Ordered (by `order`) children of `parentId` with their advance sizes. */
const childSizes = (
  scene: Scene,
  ids: readonly ElementId[],
): { id: ElementId; w: number; h: number }[] => {
  const shapes: Element[] = [];
  for (const id of ids) {
    const s = getElement(scene, id);
    if (s) shapes.push(s);
  }
  shapes.sort(byOrderAsc);
  return shapes.map((s) => {
    const sz = shapeAdvanceSize(s);
    return { id: s.id, w: sz.width, h: sz.height };
  });
};

/**
 * Position children in a wrapping flow (see {@link packWrap}). Children keep
 * their own size; the container is expected to grow vertically to fit the rows
 * (handled by the host's container auto-grow / resize clamp).
 */
export const wrapLayout: LayoutFn<WrapLayoutSpec> = (scene, spec) => {
  if (spec.shapeIds.length === 0) return null;
  const gap = spec.gap ?? 16;
  const origin = spec.origin ?? { x: 0, y: 0 };
  const sizes = childSizes(scene, spec.shapeIds);
  const { placements } = packWrap(sizes, gap, spec.innerWidth, origin);

  const patches: Patch[] = [];
  let working = scene;
  for (const p of placements) {
    const shape = getElement(working, p.id);
    if (!shape) continue;
    if (shape.position.x === p.x && shape.position.y === p.y) continue;
    const r = updateElement(working, p.id, (s) => ({ ...s, position: { x: p.x, y: p.y } }));
    working = r.scene;
    patches.push(r.patch);
  }
  if (patches.length === 0) return null;
  return batch(patches);
};

/**
 * Measure a wrap container's children at a hypothetical `innerWidth` WITHOUT
 * moving anything — used by the resize clamp / scheduler to know the minimum
 * width (widest child) and the wrapped content height (so the container can
 * grow down). Returns `null` when the parent has no children.
 */
export const measureWrap = (
  scene: Scene,
  parentId: ElementId,
  innerWidth: number,
): {
  readonly widest: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
} | null => {
  const ids: ElementId[] = [];
  for (const s of scene.elements.values()) {
    if (s.parentId === parentId) ids.push(s.id);
  }
  if (ids.length === 0) return null;
  const sizes = childSizes(scene, ids);
  const parent = getElement(scene, parentId);
  const gap = (parent ? (getAutoLayoutSpec(parent) as { gap?: number } | null) : null)?.gap ?? 16;
  const m = packWrap(sizes, gap, innerWidth, { x: 0, y: 0 });
  return { widest: m.widest, contentWidth: m.contentWidth, contentHeight: m.contentHeight };
};

// --- auto-layout container ---

/**
 * Declarative auto-layout spec stored on a parent shape's
 * `metadata.autoLayout`. Children of the parent (via `parentId`)
 * are arranged whenever the children set changes — see
 * `Editor.runLayout` for the host-side hook.
 *
 * Adding more layout kinds (tree, radial) means widening this union
 * and matching it in `runAutoLayout`. Hosts can ignore the union and
 * call `gridLayout` / `stackLayout` directly with custom spec.
 */
export type AutoLayoutSpec =
  | { readonly kind: "grid"; readonly cols: number; readonly gap?: number }
  | { readonly kind: "stack"; readonly direction: "horizontal" | "vertical"; readonly gap?: number }
  | { readonly kind: "wrap"; readonly gap?: number }
  | {
      readonly kind: "tree";
      /** Vertical distance between successive depth levels. Default 80. */
      readonly ranksep?: number;
      /** Horizontal distance between siblings. Default 24. */
      readonly nodesep?: number;
    };

/**
 * Parse and validate the `metadata.autoLayout` field on a shape.
 * Returns `null` when the shape has no auto-layout configured or the
 * stored payload doesn't match a known kind / required fields are
 * missing. Callers should treat `null` as "not an auto-layout
 * container — leave its children alone".
 */
export const getAutoLayoutSpec = (shape: Element): AutoLayoutSpec | null => {
  const m = shape.metadata?.autoLayout;
  if (!m || typeof m !== "object") return null;
  const raw = m as { kind?: string; cols?: number; gap?: number; direction?: string };
  if (raw.kind === "grid") {
    if (typeof raw.cols !== "number" || raw.cols < 1) return null;
    return {
      kind: "grid",
      cols: raw.cols,
      ...(typeof raw.gap === "number" ? { gap: raw.gap } : {}),
    };
  }
  if (raw.kind === "stack") {
    if (raw.direction !== "horizontal" && raw.direction !== "vertical") return null;
    return {
      kind: "stack",
      direction: raw.direction,
      ...(typeof raw.gap === "number" ? { gap: raw.gap } : {}),
    };
  }
  if (raw.kind === "wrap") {
    return { kind: "wrap", ...(typeof raw.gap === "number" ? { gap: raw.gap } : {}) };
  }
  if (raw.kind === "tree") {
    const treeRaw = m as { ranksep?: number; nodesep?: number };
    return {
      kind: "tree",
      ...(typeof treeRaw.ranksep === "number" ? { ranksep: treeRaw.ranksep } : {}),
      ...(typeof treeRaw.nodesep === "number" ? { nodesep: treeRaw.nodesep } : {}),
    };
  }
  // Plugin kinds — consult the registry. Returns an opaque-typed
  // spec; `runAutoLayout` re-resolves the entry and dispatches.
  if (typeof raw.kind === "string") {
    const entry = getLayoutKind(raw.kind);
    if (entry) {
      const parsed = entry.parse(m);
      if (parsed !== null) {
        return { ...(parsed as object), kind: raw.kind } as unknown as AutoLayoutSpec;
      }
    }
  }
  return null;
};

/**
 * Run the parent shape's declared auto-layout against its direct
 * children. Returns a batched patch (or `null` when nothing
 * changed). Anchoring rules:
 *
 *   1. If the parent has a container spec with a `dropZone`, the
 *      layout origin is the top-left of that drop-zone in world
 *      coords (parent.position + spec.dropZone.x/y). Children land
 *      inside the visible drop area, not overlapping the parent's
 *      title / chrome / border.
 *   2. Otherwise the origin falls back to `parent.position`.
 */
export const runAutoLayout = (scene: Scene, parentId: ElementId): Patch | null => {
  const parent = getElement(scene, parentId);
  if (!parent) return null;
  const spec = getAutoLayoutSpec(parent);
  if (!spec) return null;
  const children: ElementId[] = [];
  for (const s of scene.elements.values()) {
    if (s.parentId === parentId) children.push(s.id);
  }
  if (children.length === 0) return null;
  const dropZone = getDropZoneWorld(parent);
  const origin = dropZone ? { x: dropZone.x, y: dropZone.y } : parent.position;
  if (spec.kind === "grid") {
    return gridLayout(scene, {
      shapeIds: children,
      origin,
      cols: spec.cols,
      ...(spec.gap !== undefined ? { gap: spec.gap } : {}),
    });
  }
  if (spec.kind === "stack") {
    return stackLayout(scene, {
      shapeIds: children,
      origin,
      direction: spec.direction,
      ...(spec.gap !== undefined ? { gap: spec.gap } : {}),
    });
  }
  if (spec.kind === "wrap") {
    // Wrap within the drop-zone width; children flow + wrap, the container
    // grows DOWN to fit new rows (via the host's auto-grow / resize clamp).
    const innerWidth = dropZone ? dropZone.width : Number.POSITIVE_INFINITY;
    return wrapLayout(scene, {
      shapeIds: children,
      origin,
      innerWidth,
      ...(spec.gap !== undefined ? { gap: spec.gap } : {}),
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- closed union narrows to "tree", but plugin kinds exist at runtime and must fall through to the registry below.
  if (spec.kind === "tree") {
    return treeLayout(scene, {
      shapeIds: children,
      origin,
      ...(spec.ranksep !== undefined ? { ranksep: spec.ranksep } : {}),
      ...(spec.nodesep !== undefined ? { nodesep: spec.nodesep } : {}),
    });
  }
  // Plugin kinds — TS narrowed `spec` to `never` after exhausting
  // the closed union, so cast back to `{ kind }` to ask the
  // registry. Hosts can register layouts like "radial" without
  // editing the closed `AutoLayoutSpec` union.
  const pluginSpec = spec as { readonly kind: string };
  const entry = getLayoutKind(pluginSpec.kind);
  if (entry) {
    return entry.run(scene, parentId, children, origin, pluginSpec);
  }
  return null;
};

// --- tree layout ---

export interface TreeLayoutSpec extends LayoutSpec {
  /** Vertical distance between successive depth levels. */
  readonly ranksep?: number;
  /** Horizontal distance between siblings. */
  readonly nodesep?: number;
}

/**
 * Reingold-Tilford-style top-down tree layout. Each id in
 * `spec.shapeIds` is treated as a root; the algorithm walks
 * `parentId` *downward* via `getChildrenOf` (so a deeper subtree
 * lives entirely under one of the roots). Each level is stacked
 * vertically by `ranksep`; siblings within a level are spaced by
 * `nodesep`. Each subtree is centred above its children.
 *
 * Implementation: standard two-pass walk (bottom-up subtree-width
 * computation, then top-down x-placement).
 */
export const treeLayout: LayoutFn<TreeLayoutSpec> = (scene, spec) => {
  if (spec.shapeIds.length === 0) return null;
  const ranksep = spec.ranksep ?? 80;
  const nodesep = spec.nodesep ?? 24;
  const origin = spec.origin ?? { x: 0, y: 0 };

  // Build a child-of map filtered to shapes that exist.
  const childrenOf = (id: ElementId): Element[] => {
    const out: Element[] = [];
    for (const s of scene.elements.values()) {
      if (s.parentId === id) out.push(s);
    }
    out.sort(byOrderAsc);
    return out;
  };

  // Subtree-width / height memo.
  const widthOf = new Map<ElementId, number>();
  const heightOf = new Map<ElementId, number>();
  // Use the registered bounder (via shapeAdvanceSize) so polygon /
  // path / freedraw shapes report their real AABB; reading
  // `shape.width` directly returns `undefined` for them and would
  // collapse every non-rectangle/ellipse node to a zero-sized box.
  const shapeWidth = (s: Element): number => shapeAdvanceSize(s).width;
  const shapeHeight = (s: Element): number => shapeAdvanceSize(s).height;

  const measure = (id: ElementId): { w: number; h: number } => {
    const cachedW = widthOf.get(id);
    const cachedH = heightOf.get(id);
    if (cachedW !== undefined && cachedH !== undefined) return { w: cachedW, h: cachedH };
    const shape = getElement(scene, id);
    if (!shape) {
      widthOf.set(id, 0);
      heightOf.set(id, 0);
      return { w: 0, h: 0 };
    }
    const selfW = shapeWidth(shape);
    const selfH = shapeHeight(shape);
    const kids = childrenOf(id);
    if (kids.length === 0) {
      widthOf.set(id, selfW);
      heightOf.set(id, selfH);
      return { w: selfW, h: selfH };
    }
    let kidsW = 0;
    let kidsH = 0;
    for (let i = 0; i < kids.length; i++) {
      const m = measure(req(kids[i]).id);
      kidsW += m.w;
      if (i > 0) kidsW += nodesep;
      if (m.h > kidsH) kidsH = m.h;
    }
    const w = Math.max(selfW, kidsW);
    const h = selfH + ranksep + kidsH;
    widthOf.set(id, w);
    heightOf.set(id, h);
    return { w, h };
  };

  // Pass 1: measure every requested root.
  for (const id of spec.shapeIds) measure(id);

  // Pass 2: place. Roots are laid out left-to-right under origin.y;
  // each subtree centres its root above its children band.
  const patches: Patch[] = [];
  let working = scene;
  const place = (id: ElementId, leftX: number, topY: number): void => {
    const shape = getElement(working, id);
    if (!shape) return;
    const m = measure(id);
    const selfW = shapeWidth(shape);
    const selfH = shapeHeight(shape);
    const target = {
      x: leftX + (m.w - selfW) / 2,
      y: topY,
    };
    if (shape.position.x !== target.x || shape.position.y !== target.y) {
      const r = updateElement(working, id, (s) => ({ ...s, position: target }));
      working = r.scene;
      patches.push(r.patch);
    }
    const kids = childrenOf(id);
    if (kids.length === 0) return;
    let cursorX = leftX;
    const kidsY = topY + selfH + ranksep;
    for (const kid of kids) {
      place(kid.id, cursorX, kidsY);
      cursorX += measure(kid.id).w + nodesep;
    }
  };
  let rootsX = origin.x;
  for (const id of spec.shapeIds) {
    place(id, rootsX, origin.y);
    rootsX += measure(id).w + nodesep;
  }
  if (patches.length === 0) return null;
  return batch(patches);
};
