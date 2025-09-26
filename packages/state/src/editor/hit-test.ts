import {
  findEdgeAt,
  getAnnotationWorldPosition,
  getEdge,
  getEdgePath,
  getShapeWorldBounds,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import type { AnnotationId, LayerId, ElementId, Vec2 } from "@oh-just-another/types";
import { ALL_HANDLES, CORNER_HANDLES, hitHandle } from "../handle.js";
import { isResizable, resizeHandlesFor } from "../overlay.js";
import type { PressTarget } from "../machine.js";
import * as Selection from "../selection.js";
import { getShape } from "@oh-just-another/scene";

/** Local helper — keeps this module dependency-free of `@math`. */
const distanceTo = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

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
  readonly selectedEdge: import("@oh-just-another/types").LinkId | null;
  readonly enteredGroup: ElementId | null;
  readonly handleHitSlop: number;
  readonly edgeHandleHitSlop: number;
  readonly edgeHitThreshold: number;
  readonly hitAnnotation: (worldPoint: Vec2) => AnnotationId | null;
  readonly selectionIsAspectLocked: () => boolean;
  readonly combinedSelectionBounds: () => import("@oh-just-another/types").Bounds | null;
  readonly acceleratedShapeAt: (worldPoint: Vec2) => Element | undefined;
  readonly isShapeInteractable: (shape: Element) => boolean;
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
 * resize, not move. Edge body comes after shapes because shapes
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
  const useGroupHandles = ctx.selection.size > 1 || ctx.selectionIsAspectLocked();
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
      const shape = getShape(ctx.scene, id);
      if (!shape || !isResizable(shape)) continue;
      const bounds = getShapeWorldBounds(shape);
      const handle = hitHandle(worldPoint, bounds, zoom, ctx.handleHitSlop, resizeHandlesFor(shape));
      if (handle) {
        return { kind: "handle", elementId: id, handle, bounds };
      }
    }
  }

  // 2. Endpoint handles on a selected edge — only when an edge is
  //    selected. Threshold in screen pixels, converted to world.
  if (ctx.selectedEdge) {
    const edge = getEdge(ctx.scene, ctx.selectedEdge);
    if (edge) {
      const path = getEdgePath(ctx.scene, edge);
      if (path && path.length >= 2) {
        const handleR = ctx.edgeHandleHitSlop / zoom;
        const fromPoint = path[0]!;
        const toPoint = path[path.length - 1]!;
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
  const shape = ctx.acceleratedShapeAt(worldPoint);
  if (shape && ctx.isShapeInteractable(shape)) {
    const target = ctx.promoteToGroupRoot(shape);
    return { kind: "shape", id: target.id, bounds: getShapeWorldBounds(target) };
  }

  // 4. Edge body under cursor.
  const edge = findEdgeAt(ctx.scene, worldPoint, ctx.edgeHitThreshold / zoom);
  if (edge && !ctx.isLayerLocked(edge.layerId)) {
    return { kind: "edge", id: edge.id };
  }
  return { kind: "empty" };
};
