import {
  findLinkAt,
  getAnnotationWorldPosition,
  getLink,
  getLinkPath,
  getElementWorldBounds,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import type {
  AnnotationId,
  Bounds,
  LayerId,
  LinkId,
  ElementId,
  Transform,
  Vec2,
} from "@oh-just-another/types";
import { matrix } from "@oh-just-another/math";
import type { RenderTarget } from "@oh-just-another/renderer-core";
import { ALL_HANDLES, CORNER_HANDLES, HANDLE_HIT_SLOP, handlePosition, hitHandle } from "../handle.js";
import { isResizable, resizeHandlesFor } from "./shape-traits.js";
import {
  DEBUG_HIT_ZONE_FILL,
  DEBUG_HIT_ZONE_FILL_OPACITY,
  DEBUG_HIT_ZONE_STROKE,
  DEBUG_HIT_ZONE_STROKE_OPACITY,
  LINK_ENDPOINT_HANDLE_RADIUS,
  LINK_HIT_THRESHOLD,
} from "../constants.js";
import type { PressTarget } from "../machine.js";
import type * as Selection from "../selection.js";
import { getElement } from "@oh-just-another/scene";

/** Local hypot helper for the hit-test hot path (cheaper than a matrix op). */
const distanceTo = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Index-access helper: throws on out-of-range instead of returning `undefined`. */
const req = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("packages/state: index out of range");
  return v;
};

/**
 * Bundle of everything `pickPressTarget` needs from the host
 * editor. Kept narrow so this module doesn't import `Editor` and
 * stays acycle-free. Callbacks are passed in instead of methods on
 * a ref class because there are only a handful of them and each is
 * a small closure over editor state at call time.
 */
export interface HitTestContext {
  readonly scene: Scene;
  readonly selection: Selection.Selection;
  readonly selectedLink: LinkId | null;
  /** Count of selected links — group handles trigger on total objects > 1. */
  readonly selectedLinkCount: number;
  readonly enteredGroup: ElementId | null;
  readonly handleHitSlop: number;
  readonly edgeHandleHitSlop: number;
  readonly edgeHitThreshold: number;
  readonly hitAnnotation: (worldPoint: Vec2) => AnnotationId | null;
  readonly selectionIsAspectLocked: () => boolean;
  readonly combinedSelectionBounds: () => Bounds | null;
  readonly acceleratedElementAt: (worldPoint: Vec2) => Element | undefined;
  readonly isElementInteractable: (shape: Element) => boolean;
  readonly isLayerLocked: (layerId: LayerId) => boolean;
  readonly promoteToGroupRoot: (shape: Element) => Element;
}

/**
 * Resolve the press target under the cursor — annotation pin →
 * group resize handles → single-shape resize handles → edge
 * endpoint handles → topmost shape → edge body → empty.
 *
 * Order matters: annotation pins sit visually above everything, so
 * a click on one always wins. Resize handles win over the body of
 * the shape they belong to so a click on the corner is treated as
 * resize, not move. Link body comes after shapes because shapes
 * have richer hit targets.
 *
 * Pure — every dependency on Editor goes through `ctx`. Editor's
 * wrapper just forwards `worldPoint`.
 */
export const pickPressTarget = (worldPoint: Vec2, ctx: HitTestContext): PressTarget => {
  const zoom = ctx.scene.viewport.zoom;

  // 0. Annotation pin first — pins sit visually above everything,
  //    so a pointer-down that lands on a pin drives the pin drag
  //    gesture regardless of what's underneath.
  const annId = ctx.hitAnnotation(worldPoint);
  if (annId !== null) {
    const ann = ctx.scene.annotations.get(annId);
    if (ann) {
      return {
        kind: "annotation",
        id: annId,
        origin: getAnnotationWorldPosition(ctx.scene, ann),
      };
    }
  }

  // 1a. Group resize handles win when several shapes are selected,
  //     OR when a single group-typed shape is selected (which has
  //     no intrinsic bounds — children's union AABB serves as the
  //     resize frame). Aspect-locked groups restrict the hit set to
  //     the four corner handles.
  const useGroupHandles =
    ctx.selection.size + ctx.selectedLinkCount > 1 || ctx.selectionIsAspectLocked();
  if (useGroupHandles) {
    const combined = ctx.combinedSelectionBounds();
    if (combined) {
      const aspectLocked = ctx.selectionIsAspectLocked();
      const handleSet = aspectLocked ? CORNER_HANDLES : ALL_HANDLES;
      const handle = hitHandle(worldPoint, combined, zoom, ctx.handleHitSlop, handleSet);
      if (handle) {
        return { kind: "group-handle", handle, bounds: combined };
      }
    }
  }

  // 1b. Resize handles on a single selected shape — only when exactly
  //     one shape is selected. Multi-selection drops per-shape handles
  //     in favour of the group bbox handles above; otherwise users
  //     could resize one child outside the combined frame, which is
  //     inconsistent with the group outline.
  if (ctx.selection.size === 1) {
    for (const id of ctx.selection) {
      const shape = getElement(ctx.scene, id);
      if (!shape || !isResizable(shape)) continue;
      const bounds = getElementWorldBounds(shape);
      const handle = hitHandle(worldPoint, bounds, zoom, ctx.handleHitSlop, resizeHandlesFor(shape));
      if (handle) {
        return { kind: "handle", elementId: id, handle, bounds };
      }
    }
  }

  // 2. Endpoint handles on a selected edge — only when an edge is
  //    selected. Threshold in screen pixels, converted to world.
  if (ctx.selectedLink) {
    const edge = getLink(ctx.scene, ctx.selectedLink);
    if (edge) {
      const path = getLinkPath(ctx.scene, edge);
      if (path && path.length >= 2) {
        const handleR = ctx.edgeHandleHitSlop / zoom;
        const fromPoint = req(path[0]);
        const toPoint = req(path[path.length - 1]);
        if (distanceTo(worldPoint, fromPoint) <= handleR) {
          return { kind: "edge-endpoint", linkId: edge.id, side: "from" };
        }
        if (distanceTo(worldPoint, toPoint) <= handleR) {
          return { kind: "edge-endpoint", linkId: edge.id, side: "to" };
        }
      }
    }
  }

  // 3. Topmost shape under cursor. Skip shapes whose layer is locked
  //    OR whose own / ancestor `locked` flag is set (group lock
  //    propagation). When the hit shape is a child of a group,
  //    promote to the group root unless the user has "entered" that
  //    group via double-click.
  const shape = ctx.acceleratedElementAt(worldPoint);
  if (shape && ctx.isElementInteractable(shape)) {
    const target = ctx.promoteToGroupRoot(shape);
    return { kind: "element", id: target.id, bounds: getElementWorldBounds(target) };
  }

  // 4. Link body under cursor.
  const edge = findLinkAt(ctx.scene, worldPoint, ctx.edgeHitThreshold / zoom);
  if (edge && !ctx.isLayerLocked(edge.layerId)) {
    return { kind: "link", id: edge.id };
  }
  return { kind: "empty" };
};

// ---------------------------------------------------------------------------
// Debug hit-zone visualisation
// ---------------------------------------------------------------------------
// Lives next to `pickPressTarget` (the hit-test it visualises) so the drawn
// zones and the real hit-targets share the same geometry — handle slop,
// link threshold, endpoint radius — and can't drift. Painted by the
// selection overlay (host debug panel → Display → "Show hit-zones"); all
// sizes are screen-pixel because the hit-test works in screen space.

/** Translucent debug rect: filled zone + faint outline. */
const fillZoneRect = (target: RenderTarget, x: number, y: number, w: number, h: number): void => {
  target.setStroke(null);
  target.setFill(DEBUG_HIT_ZONE_FILL);
  target.setOpacity(DEBUG_HIT_ZONE_FILL_OPACITY);
  target.beginPath();
  target.rect(x, y, w, h);
  target.fill();
  target.setFill(null);
  target.setStroke(DEBUG_HIT_ZONE_STROKE);
  target.setStrokeWidth(1);
  target.setOpacity(DEBUG_HIT_ZONE_STROKE_OPACITY);
  target.beginPath();
  target.rect(x, y, w, h);
  target.stroke();
};

/** Translucent debug circle: filled zone + faint outline. */
const fillZoneCircle = (target: RenderTarget, cx: number, cy: number, r: number): void => {
  target.setStroke(null);
  target.setFill(DEBUG_HIT_ZONE_FILL);
  target.setOpacity(DEBUG_HIT_ZONE_FILL_OPACITY);
  target.beginPath();
  target.ellipse(cx, cy, r, r);
  target.fill();
  target.setFill(null);
  target.setStroke(DEBUG_HIT_ZONE_STROKE);
  target.setStrokeWidth(1);
  target.setOpacity(DEBUG_HIT_ZONE_STROKE_OPACITY);
  target.beginPath();
  target.ellipse(cx, cy, r, r);
  target.stroke();
};

/**
 * Paint every element's mouse hit-zones so the tuned slop / threshold values
 * can be eyeballed in the browser. Handle slop squares for resizable shapes
 * (matches the handle hit-test in `pickPressTarget`); endpoint circles + a
 * body band for links (the `LINK_HIT_THRESHOLD` band `findLinkAt` uses).
 * Isolated in its own save/restore so the translucent paint state never
 * leaks into the real selection chrome.
 */
export const drawHitZones = (
  target: RenderTarget,
  scene: Scene,
  w2s: Transform,
  zoom: number,
): void => {
  target.save();
  // Resize-handle slop squares — resizable shapes only (matches the
  // hit-test, which only offers handles on resizable selections).
  for (const shape of scene.elements.values()) {
    if (!isResizable(shape)) continue;
    const wb = getElementWorldBounds(shape);
    for (const handle of resizeHandlesFor(shape)) {
      const c = matrix.applyToPoint(w2s, handlePosition(handle, wb, zoom));
      fillZoneRect(
        target,
        c.x - HANDLE_HIT_SLOP,
        c.y - HANDLE_HIT_SLOP,
        HANDLE_HIT_SLOP * 2,
        HANDLE_HIT_SLOP * 2,
      );
    }
  }
  // Link body bands (polyline stroked at 2× the hit threshold) + endpoint
  // circles.
  for (const edge of scene.links.values()) {
    const path = getLinkPath(scene, edge);
    if (!path || path.length < 2) continue;
    target.setFill(null);
    target.setStroke(DEBUG_HIT_ZONE_STROKE);
    target.setStrokeWidth(LINK_HIT_THRESHOLD * 2);
    target.setOpacity(DEBUG_HIT_ZONE_FILL_OPACITY);
    target.setLineCap("round");
    target.setLineJoin("round");
    target.beginPath();
    const start = matrix.applyToPoint(w2s, req(path[0]));
    target.moveTo(start.x, start.y);
    for (let i = 1; i < path.length; i++) {
      const p = matrix.applyToPoint(w2s, req(path[i]));
      target.lineTo(p.x, p.y);
    }
    target.stroke();
    const from = matrix.applyToPoint(w2s, req(path[0]));
    const to = matrix.applyToPoint(w2s, req(path[path.length - 1]));
    fillZoneCircle(target, from.x, from.y, LINK_ENDPOINT_HANDLE_RADIUS);
    fillZoneCircle(target, to.x, to.y, LINK_ENDPOINT_HANDLE_RADIUS);
  }
  target.setOpacity(1);
  target.restore();
};
