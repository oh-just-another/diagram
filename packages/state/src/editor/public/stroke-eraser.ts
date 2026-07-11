import { req } from "../../util.js";
import {
  addElement,
  removeElement,
  removeLink,
  orderBetween,
  isBrush,
  endpointElementId,
  type BrushElement,
  type BrushPoint,
  type Scene,
  type Patch,
} from "@oh-just-another/scene";
import {
  elementId as castElementId,
  type ElementId,
  type LinkId,
  type Vec2,
} from "@oh-just-another/types";
import { ERASE_FRAGMENT_MIN_ARC } from "../../constants.js";
import {
  brushArc,
  coveredArcAgainstSegment,
  complementIntervals,
  mergeIntervals,
  localPointAtArc,
  type Interval,
} from "./stroke-eraser-coverage.js";

const EPS = 1e-6;

/**
 * Rebuild a brush's surviving pieces from the COVERED arc-length spans the eraser
 * removed. The kept spans (complement of `covered`) each become a fresh fragment
 * {@link BrushElement}: the span endpoints — already pinned to the eraser ring by
 * {@link coveredArcAgainstSegment}'s bisection — are the fragment's first/last
 * points, with the original vertices strictly inside the span in between. Points
 * are re-localised to the fragment's first world position, per-point widths kept,
 * fractional `order`s around the original's slot, never `closed`.
 *
 * Cutting by ARC LENGTH (not vertex index) is what makes the eraser remove the
 * geometry it visibly covers regardless of how densely the stroke was sampled — a
 * big disc grazing a sparse line no longer slips between two far-apart vertices. A
 * kept span shorter than {@link ERASE_FRAGMENT_MIN_ARC} is dropped (litter).
 */
const buildFragmentsFromCoverage = (
  brush: BrushElement,
  covered: readonly Interval[],
  makeId: () => ElementId,
): BrushElement[] => {
  const arc = brushArc(brush);
  if (arc.total === 0) return []; // a single-point brush leaves nothing once cut
  const kept = complementIntervals(covered, arc.total);
  const fragments: BrushElement[] = [];
  let prevOrder = brush.order;
  let idx = 0;
  for (const [L0, L1] of kept) {
    if (L1 - L0 < ERASE_FRAGMENT_MIN_ARC) continue; // drop stray nubs
    const runPts: BrushPoint[] = [localPointAtArc(arc, L0)];
    for (let i = 0; i < arc.pts.length; i++) {
      const c = req(arc.cum[i]);
      if (c > L0 + EPS && c < L1 - EPS) runPts.push({ ...req(arc.pts[i]) });
    }
    runPts.push(localPointAtArc(arc, L1));
    if (runPts.length < 2) continue;
    const anchor = req(runPts[0]);
    const worldFirst = { x: brush.position.x + anchor.x, y: brush.position.y + anchor.y };
    const localPoints: BrushPoint[] = runPts.map((p) => ({
      x: p.x - anchor.x,
      y: p.y - anchor.y,
      width: p.width,
    }));
    const order = idx === 0 ? brush.order : orderBetween(prevOrder, null);
    prevOrder = order;
    idx++;
    fragments.push({
      id: makeId(),
      layerId: brush.layerId,
      type: "brush",
      position: worldFirst,
      rotation: 0,
      scale: { x: 1, y: 1 },
      order,
      style: brush.style,
      points: localPoints,
    });
  }
  return fragments;
};

/**
 * Grow a brush's accumulated covered spans by the eraser segment `a → b` (world)
 * at `radius` and return the merged result. INCREMENTAL: the live gesture calls
 * this once per pointer move with only the new segment, so a drag costs
 * O(points) per move instead of re-scanning the whole path each frame. `radius`
 * is the visible cursor ring in world units. Pure — returns a new interval list.
 */
export const markErasedIntervals = (
  brush: BrushElement,
  existing: readonly Interval[],
  a: Vec2,
  b: Vec2,
  radius: number,
): Interval[] => {
  const add = coveredArcAgainstSegment(brushArc(brush), a, b, radius);
  if (add.length === 0) return existing.length > 0 ? mergeIntervals(existing) : [];
  return mergeIntervals([...existing, ...add]);
};

/**
 * STROKE-ERASER core (pure). Cut a single brush against an eraser path: the arc
 * spans of the brush polyline within `radius` of the path are removed and the
 * survivors split into fragment {@link BrushElement}s (endpoints on the ring).
 * When nothing is covered, `erasedAny` is `false` and `fragments` is `[brush]`
 * unchanged so the caller can skip the swap. One-shot (scans the whole path) —
 * the live gesture uses the incremental {@link markErasedIntervals} instead.
 */
export const computeEraseBrushStroke = (
  brush: BrushElement,
  eraserPathWorld: readonly Vec2[],
  radius: number,
  makeId: () => ElementId,
): { fragments: BrushElement[]; erasedAny: boolean } => {
  if (eraserPathWorld.length === 0) return { fragments: [brush], erasedAny: false };
  const arc = brushArc(brush);
  let covered: Interval[] = [];
  const segs = Math.max(1, eraserPathWorld.length - 1);
  for (let i = 0; i < segs; i++) {
    const a = req(eraserPathWorld[i]);
    const b = req(eraserPathWorld[Math.min(i + 1, eraserPathWorld.length - 1)]);
    const add = coveredArcAgainstSegment(arc, a, b, radius);
    if (add.length > 0) covered = mergeIntervals([...covered, ...add]);
  }
  if (covered.length === 0) return { fragments: [brush], erasedAny: false };
  return { fragments: buildFragmentsFromCoverage(brush, covered, makeId), erasedAny: true };
};

/**
 * Commit the accumulated stroke-erase: `erased` maps each touched brush id to the
 * covered arc-length spans built incrementally by {@link markErasedIntervals}.
 * Each such brush is replaced with its fragments (remove original + add fragments)
 * and any link bound to it is detached (drop the binding — don't re-bind to a
 * fragment). Returns the next scene + patches for ONE history batch, or `null`
 * when nothing is cut.
 */
export const computeEraseFromMasks = (
  scene: Scene,
  erased: ReadonlyMap<ElementId, readonly Interval[]>,
  makeId: () => ElementId,
): {
  readonly scene: Scene;
  readonly patches: Patch[];
  readonly removedIds: ElementId[];
  readonly addedIds: ElementId[];
} | null => {
  let s = scene;
  const patches: Patch[] = [];
  const removedIds: ElementId[] = [];
  const addedIds: ElementId[] = [];
  const droppedLinks = new Set<LinkId>();
  for (const [brushId, covered] of erased) {
    if (covered.length === 0) continue;
    const el = scene.elements.get(brushId);
    if (el === undefined || !isBrush(el)) continue;
    const fragments = buildFragmentsFromCoverage(el, covered, makeId);
    // Detach links bound to this brush before removing it.
    for (const edge of [...s.links.values()]) {
      if (droppedLinks.has(edge.id)) continue;
      if (endpointElementId(edge.from) === el.id || endpointElementId(edge.to) === el.id) {
        const r = removeLink(s, edge.id);
        s = r.scene;
        patches.push(r.patch);
        droppedLinks.add(edge.id);
      }
    }
    const removed = removeElement(s, el.id);
    s = removed.scene;
    patches.push(removed.patch);
    removedIds.push(el.id);
    for (const frag of fragments) {
      const added = addElement(s, frag);
      s = added.scene;
      patches.push(added.patch);
      addedIds.push(frag.id);
    }
  }
  if (patches.length === 0) return null;
  return { scene: s, patches, removedIds, addedIds };
};

/**
 * Live-preview counterpart of {@link computeEraseFromMasks}: the cut fragments for
 * every brush with covered spans so far, WITHOUT mutating the scene or consuming
 * real ids. `fragments` are drawn on the overlay and `hidden` (the touched
 * originals) suppressed in the main pass, so the user sees the cut before
 * releasing. Fragment ids are deterministic per frame (never enter history).
 * `null` when nothing is cut yet.
 */
export const computeStrokeErasePreviewFromMasks = (
  scene: Scene,
  erased: ReadonlyMap<ElementId, readonly Interval[]>,
): { fragments: BrushElement[]; hidden: Set<ElementId> } | null => {
  const fragments: BrushElement[] = [];
  const hidden = new Set<ElementId>();
  for (const [brushId, covered] of erased) {
    if (covered.length === 0) continue;
    const el = scene.elements.get(brushId);
    if (el === undefined || !isBrush(el)) continue;
    let n = 0;
    const parts = buildFragmentsFromCoverage(el, covered, () =>
      castElementId(`stroke-erase-preview-${el.id}-${n++}`),
    );
    hidden.add(el.id);
    fragments.push(...parts);
  }
  if (hidden.size === 0) return null;
  return { fragments, hidden };
};
