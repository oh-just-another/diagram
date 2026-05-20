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
import { anchorOverlayPoints } from "./anchor-points.js";
import {
  ANCHOR_DOT_ACTIVE_RADIUS,
  ANCHOR_DOT_CLICK_RADIUS,
  ANCHOR_START_HIT_SLOP,
  DEBUG_HIT_ZONE_FILL_OPACITY,
  DEBUG_HIT_ZONE_STROKE_OPACITY,
  DEBUG_ZONE_ANCHOR_START,
  DEBUG_ZONE_ATTACH_BODY,
  DEBUG_ZONE_ATTACH_EDGE,
  DEBUG_ZONE_ATTACH_POINT,
  DEBUG_ZONE_CONTAINER,
  DEBUG_ZONE_FRAME,
  DEBUG_ZONE_LINK_BODY,
  DEBUG_ZONE_LINK_HANDLE,
  DEBUG_ZONE_RESIZE,
  LINK_ENDPOINT_HANDLE_RADIUS,
  LINK_HIT_THRESHOLD,
  LINK_START_ANCHOR_OUTSET,
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

/** Translucent debug rect in `color`: filled zone + faint outline. */
const fillZoneRect = (
  target: RenderTarget,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void => {
  target.setStroke(null);
  target.setFill(color);
  target.setOpacity(DEBUG_HIT_ZONE_FILL_OPACITY);
  target.beginPath();
  target.rect(x, y, w, h);
  target.fill();
  target.setFill(null);
  target.setStroke(color);
  target.setStrokeWidth(1);
  target.setOpacity(DEBUG_HIT_ZONE_STROKE_OPACITY);
  target.beginPath();
  target.rect(x, y, w, h);
  target.stroke();
};

/** Translucent debug circle in `color`: filled zone + faint outline. */
const fillZoneCircle = (
  target: RenderTarget,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void => {
  target.setStroke(null);
  target.setFill(color);
  target.setOpacity(DEBUG_HIT_ZONE_FILL_OPACITY);
  target.beginPath();
  target.ellipse(cx, cy, r, r);
  target.fill();
  target.setFill(null);
  target.setStroke(color);
  target.setStrokeWidth(1);
  target.setOpacity(DEBUG_HIT_ZONE_STROKE_OPACITY);
  target.beginPath();
  target.ellipse(cx, cy, r, r);
  target.stroke();
};

/**
 * Outline-only debug circle in `color` — no fill. Used to draw a SECONDARY
 * zone nested inside a filled one (e.g. the narrow click radius inside the
 * wider grab halo of an anchor dot) so the two read as distinct without the
 * inner fill muddying the outer one. Dashed so it can't be mistaken for the
 * solid grab-halo outline.
 */
const strokeZoneCircle = (
  target: RenderTarget,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void => {
  target.setFill(null);
  target.setStroke(color);
  target.setStrokeWidth(1);
  target.setDashArray([2, 2]);
  target.setOpacity(DEBUG_HIT_ZONE_STROKE_OPACITY);
  target.beginPath();
  target.ellipse(cx, cy, r, r);
  target.stroke();
  target.setDashArray(null);
};

/**
 * Translucent debug polygon (filled closed loop) in `color` — used for area
 * zones like a floating-attach body or a container drop-zone. `pts` are
 * SCREEN-space points.
 */
const fillZoneLoop = (target: RenderTarget, pts: readonly Vec2[], color: string): void => {
  if (pts.length < 3) return;
  target.setStroke(null);
  target.setFill(color);
  target.setOpacity(DEBUG_HIT_ZONE_FILL_OPACITY);
  target.beginPath();
  const first = req(pts[0]);
  target.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p = req(pts[i]);
    target.lineTo(p.x, p.y);
  }
  target.closePath();
  target.fill();
  target.setFill(null);
  target.setStroke(color);
  target.setStrokeWidth(1);
  target.setOpacity(DEBUG_HIT_ZONE_STROKE_OPACITY);
  target.beginPath();
  target.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p = req(pts[i]);
    target.lineTo(p.x, p.y);
  }
  target.closePath();
  target.stroke();
};

/**
 * Minimal slice of the selected link's handle geometry the debug viz
 * needs — endpoints plus the bend / segment handle world positions the
 * orchestrator already computed for the real overlay. Mirrors
 * `LinkSelection` in `overlay.ts` without importing it (would close the
 * overlay ↔ hit-test runtime cycle).
 */
export interface HitZoneEdge {
  readonly from: Vec2;
  readonly to: Vec2;
  /** Existing bend points (world) — grabbable at `LINK_ENDPOINT_HANDLE_RADIUS`. */
  readonly waypoints?: readonly Vec2[];
  /** Segment / "add waypoint" midpoints (world) — same grab radius. */
  readonly midpoints?: readonly Vec2[];
}

/**
 * Link-attach drop-zones to paint while a link endpoint is being placed
 * (drag from a start dot / draw-edge / endpoint rebind). These are the
 * snap-engine catchments `snapLinkEndpoint` resolves against, so the user
 * can see where a drop lands ON a point vs ON an edge:
 *   - `anchors` — world landing points of each element's connection anchors
 *     (drop within `thresholdWorld` → fixed anchor);
 *   - `outlineLoops` — world outline loops of each element (drop within
 *     `thresholdWorld` of the perimeter → fixed outline point).
 * `thresholdWorld` is the snap threshold in WORLD units (constant on screen
 * only after × zoom), matching the engine which compares world distances.
 */
export interface HitZoneAttach {
  readonly anchors: readonly Vec2[];
  readonly outlineLoops: readonly (readonly Vec2[])[];
  readonly thresholdWorld: number;
}

/**
 * Element drop-zones to paint while an ELEMENT is being dragged — the two
 * (separate) membership systems an element can be dropped into:
 *   - `frames` — full world bounds of every frame; an element joins the
 *     top-most frame whose bounds contain the dragged element's CENTROID
 *     (`reconcileFrameMembership`).
 *   - `containers` — resolved drop-zone world bounds of every template /
 *     auto-layout / static container; an element reparents to the container
 *     whose drop-zone contains the cursor (`findContainerAt`).
 * All bounds are WORLD-space; the draw projects them to screen.
 */
export interface HitZoneContainers {
  readonly frames: readonly Bounds[];
  readonly containers: readonly Bounds[];
}

/**
 * Which hit-zone categories the debug overlay should paint. Each flag maps to
 * one block in `drawHitZones`.
 */
export interface HitZoneVisibility {
  /** Resize-handle slop squares on resizable shapes. */
  readonly resizeHandles: boolean;
  /** Body bands for every link (the `findLinkAt` catchment). */
  readonly linkBodies: boolean;
  /** The selected link's endpoint / waypoint / segment handle circles. */
  readonly selectedEdgeHandles: boolean;
  /** The single selected element's link-start anchor dots (grab + click). */
  readonly anchorDots: boolean;
  /** Link-attach drop-zones (anchor catchments + edge bands + floating body). */
  readonly attachDropZones: boolean;
  /** Element drop-zones (frames + containers) while dragging an element. */
  readonly containerDropZones: boolean;
}

/**
 * SINGLE source of truth for which hit-zone categories are actionable in the
 * current interaction state — so the debug overlay highlights ONLY what the
 * user can actually do right now (and the real `pickPressTarget` /
 * pointer-binding would accept).
 *
 * Three mutually-exclusive regimes:
 *   - placing a link endpoint (drag from a start dot / draw-edge / endpoint
 *     rebind) → only the link-attach drop-zones are live;
 *   - dragging an element → only the element drop-zones (frames + containers)
 *     are live;
 *   - at rest → resize / link-body / selected-edge / start-dot zones.
 * Every press in a drag regime is consumed by that gesture, so the other
 * categories are inert and hidden.
 */
export const hitZoneVisibility = (input: {
  readonly linkDragActive: boolean;
  readonly elementDragActive: boolean;
}): HitZoneVisibility => {
  const none: HitZoneVisibility = {
    resizeHandles: false,
    linkBodies: false,
    selectedEdgeHandles: false,
    anchorDots: false,
    attachDropZones: false,
    containerDropZones: false,
  };
  // Link placement wins if somehow both are set (it can't normally).
  if (input.linkDragActive) return { ...none, attachDropZones: true };
  if (input.elementDragActive) return { ...none, containerDropZones: true };
  return {
    ...none,
    resizeHandles: true,
    linkBodies: true,
    selectedEdgeHandles: true,
    anchorDots: true,
  };
};

/**
 * Inputs for `drawHitZones`. `visibility` (from `hitZoneVisibility`) gates
 * which blocks paint; the geometry fields are consumed only by their
 * corresponding block.
 */
export interface DrawHitZonesOptions {
  readonly scene: Scene;
  readonly w2s: Transform;
  readonly zoom: number;
  readonly selection: Selection.Selection;
  readonly visibility: HitZoneVisibility;
  readonly edgeSelection?: HitZoneEdge;
  readonly attach?: HitZoneAttach;
  readonly containers?: HitZoneContainers;
}

/**
 * Paint the mouse hit-zones gated by `visibility` so the tuned slop /
 * threshold values can be eyeballed in the browser AND only the currently
 * actionable targets show. Covers, in screen space (the hit-test works in
 * screen px):
 *   - resize-handle slop squares for resizable shapes (matches the handle
 *     hit-test in `pickPressTarget`);
 *   - a body band for every link (the `LINK_HIT_THRESHOLD` band `findLinkAt`
 *     uses);
 *   - the SELECTED link's endpoint + waypoint + segment handle circles
 *     (`LINK_ENDPOINT_HANDLE_RADIUS` — these handles are only hit-testable on
 *     the selected link, so they're drawn only for it);
 *   - the SINGLE selected element's link-start anchor dots, each with TWO
 *     nested zones: the wider filled grab halo
 *     (`ANCHOR_DOT_ACTIVE_RADIUS + ANCHOR_START_HIT_SLOP`, begins a link
 *     drag) and the narrow dashed click radius (`ANCHOR_DOT_CLICK_RADIUS`,
 *     click-to-create-element).
 *
 * `edgeSelection` carries the sole selected link's handle positions the
 * orchestrator already computed for the real overlay, so the drawn handle
 * zones land exactly where the chrome does. Isolated in its own
 * save/restore so the translucent paint state never leaks into the real
 * selection chrome.
 */
export const drawHitZones = (target: RenderTarget, opts: DrawHitZonesOptions): void => {
  const { scene, w2s, zoom, selection, visibility, edgeSelection, attach, containers } = opts;
  target.save();
  // Resize-handle slop squares — resizable shapes only (matches the
  // hit-test, which only offers handles on resizable selections).
  if (visibility.resizeHandles) {
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
          DEBUG_ZONE_RESIZE,
        );
      }
    }
  }
  // Link body bands (polyline stroked at 2× the hit threshold) — the
  // `findLinkAt` target, hit-testable for EVERY link.
  if (visibility.linkBodies) {
    for (const edge of scene.links.values()) {
      const path = getLinkPath(scene, edge);
      if (!path || path.length < 2) continue;
      target.setFill(null);
      target.setStroke(DEBUG_ZONE_LINK_BODY);
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
    }
  }
  // Selected link's handle zones — endpoint, waypoint and segment-midpoint
  // grab circles. These handles only exist on the selected link (see
  // `pickPressTarget` step 2 + the waypoint / segment drag in
  // `pointer-binding`), so they're drawn only for it, at the same
  // `LINK_ENDPOINT_HANDLE_RADIUS` the press uses.
  if (visibility.selectedEdgeHandles && edgeSelection) {
    const from = matrix.applyToPoint(w2s, edgeSelection.from);
    const to = matrix.applyToPoint(w2s, edgeSelection.to);
    fillZoneCircle(target, from.x, from.y, LINK_ENDPOINT_HANDLE_RADIUS, DEBUG_ZONE_LINK_HANDLE);
    fillZoneCircle(target, to.x, to.y, LINK_ENDPOINT_HANDLE_RADIUS, DEBUG_ZONE_LINK_HANDLE);
    for (const w of edgeSelection.waypoints ?? []) {
      const p = matrix.applyToPoint(w2s, w);
      fillZoneCircle(target, p.x, p.y, LINK_ENDPOINT_HANDLE_RADIUS, DEBUG_ZONE_LINK_HANDLE);
    }
    for (const m of edgeSelection.midpoints ?? []) {
      const p = matrix.applyToPoint(w2s, m);
      fillZoneCircle(target, p.x, p.y, LINK_ENDPOINT_HANDLE_RADIUS, DEBUG_ZONE_LINK_HANDLE);
    }
  }
  // Single selected element's link-start anchor dots — wider filled grab
  // halo (begins a link drag) + narrow dashed click radius (click-to-create).
  // Only on a sole-element selection, matching the anchor-drag hit-test.
  if (visibility.anchorDots && selection.size === 1) {
    const id = req([...selection][0]);
    const shape = getElement(scene, id);
    if (shape) {
      const grab = ANCHOR_DOT_ACTIVE_RADIUS + ANCHOR_START_HIT_SLOP;
      const { worldPoints } = anchorOverlayPoints(shape, LINK_START_ANCHOR_OUTSET / zoom);
      for (const p of worldPoints) {
        const c = matrix.applyToPoint(w2s, p);
        fillZoneCircle(target, c.x, c.y, grab, DEBUG_ZONE_ANCHOR_START);
        strokeZoneCircle(target, c.x, c.y, ANCHOR_DOT_CLICK_RADIUS, DEBUG_ZONE_ANCHOR_START);
      }
    }
  }
  // Link-attach drop-zones — only while a link endpoint is being placed.
  // Snap catchment is in WORLD units, so screen radius / band width = world
  // threshold × zoom. Order (under → over): floating body fill (L4), edge band
  // (L3), anchor catchment circles (L1/L2) so points sit on top.
  if (visibility.attachDropZones && attach) {
    const bandWorld = attach.thresholdWorld * zoom;
    // L4: drop on the body interior → floating attach. Fill each candidate's
    // outline loop so the user sees "drop anywhere here floats to this shape".
    for (const loop of attach.outlineLoops) {
      fillZoneLoop(
        target,
        loop.map((p) => matrix.applyToPoint(w2s, p)),
        DEBUG_ZONE_ATTACH_BODY,
      );
    }
    // L3: outline band (fixed outline point along the perimeter).
    target.setFill(null);
    target.setStroke(DEBUG_ZONE_ATTACH_EDGE);
    target.setStrokeWidth(bandWorld * 2);
    target.setOpacity(DEBUG_HIT_ZONE_FILL_OPACITY);
    target.setLineCap("round");
    target.setLineJoin("round");
    for (const loop of attach.outlineLoops) {
      if (loop.length < 2) continue;
      target.beginPath();
      const first = matrix.applyToPoint(w2s, req(loop[0]));
      target.moveTo(first.x, first.y);
      for (let i = 1; i < loop.length; i++) {
        const p = matrix.applyToPoint(w2s, req(loop[i]));
        target.lineTo(p.x, p.y);
      }
      target.closePath();
      target.stroke();
    }
    // L1/L2: named / edge anchor catchment circles.
    for (const a of attach.anchors) {
      const c = matrix.applyToPoint(w2s, a);
      fillZoneCircle(target, c.x, c.y, bandWorld, DEBUG_ZONE_ATTACH_POINT);
    }
  }
  // Element drop-zones — only while an element is being dragged. Frames
  // (centroid-in-bounds) and containers (cursor-in-drop-zone). Bounds
  // are world-space; project the four corners to a screen loop.
  if (visibility.containerDropZones && containers) {
    const drawBounds = (b: Bounds, color: string): void => {
      const corners = [
        { x: b.x, y: b.y },
        { x: b.x + b.width, y: b.y },
        { x: b.x + b.width, y: b.y + b.height },
        { x: b.x, y: b.y + b.height },
      ].map((p) => matrix.applyToPoint(w2s, p));
      fillZoneLoop(target, corners, color);
    };
    for (const b of containers.frames) drawBounds(b, DEBUG_ZONE_FRAME);
    for (const b of containers.containers) drawBounds(b, DEBUG_ZONE_CONTAINER);
  }
  target.setOpacity(1);
  target.restore();
};
