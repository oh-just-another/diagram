import { assign, enqueueActions, setup } from "xstate";
import type { AnnotationId, Bounds, LinkId, Modifiers, ElementId, Vec2 } from "@oh-just-another/types";
import type { HandleId } from "./handle.js";
import { DEFAULT_MODE, type Mode } from "./modes.js";

/**
 * What the pointer landed on when the user pressed it down. The host computes
 * this synchronously on POINTER_DOWN (via scene queries + handle hit-test) and
 * hands it to the machine, which decides how to interpret the gesture from
 * that point on.
 */
export type PressTarget =
  | { readonly kind: "shape"; readonly id: ElementId; readonly bounds: Bounds }
  | {
      readonly kind: "handle";
      readonly elementId: ElementId;
      readonly handle: HandleId;
      readonly bounds: Bounds;
    }
  | {
      /**
       * Handle on the combined bounding box of a multi-selection. The
       * editor uses it to drive a group resize gesture; the machine
       * treats it the same as `handle` (per-frame RESIZE_SHAPE emits) and
       * the editor's emit handler fans out the scaling to every member.
       */
      readonly kind: "group-handle";
      readonly handle: HandleId;
      readonly bounds: Bounds;
    }
  | { readonly kind: "edge"; readonly id: LinkId }
  | {
      readonly kind: "edge-endpoint";
      readonly linkId: LinkId;
      readonly side: "from" | "to";
    }
  | {
      /**
       * Annotation pin under the cursor. The gesture machine treats it
       * like a one-axis-free shape drag: every POINTER_MOVE emits
       * `MOVE_ANNOTATION` with the world-space delta from press-down;
       * POINTER_UP closes the gesture. Anchored annotations
       * (shape-relative) and free annotations both move via `position`;
       * the editor's apply handler preserves the anchor semantics.
       */
      readonly kind: "annotation";
      readonly id: AnnotationId;
      readonly origin: Vec2;
    }
  | { readonly kind: "empty" };

export interface InteractionContext {
  readonly mode: Mode;
  readonly pressOrigin: Vec2 | null;
  readonly pressLast: Vec2 | null;
  readonly pressTarget: PressTarget | null;
  readonly drawingType: "rect" | "ellipse" | "frame" | null;
  /** Keyboard state captured at POINTER_DOWN. */
  readonly pressModifiers: Modifiers | null;
}

const initialContext = (): InteractionContext => ({
  mode: DEFAULT_MODE,
  pressOrigin: null,
  pressLast: null,
  pressTarget: null,
  drawingType: null,
  pressModifiers: null,
});

export interface PointerDownEvent {
  readonly type: "POINTER_DOWN";
  readonly point: Vec2;
  readonly target: PressTarget;
  /**
   * Keyboard state at press-down time. `interpretPressEnd` reads the
   * modifiers to decide between SELECT_REPLACE (plain click) and
   * SELECT_TOGGLE (shift / meta click) when the gesture is a tap.
   */
  readonly modifiers?: Modifiers;
}
export interface PointerMoveEvent {
  readonly type: "POINTER_MOVE";
  readonly point: Vec2;
}
export interface PointerUpEvent {
  readonly type: "POINTER_UP";
  readonly point: Vec2;
  /**
   * Optional hit-test of the element under the pointer at release time.
   * Hosts that want edge-creation to land on a shape provide this. When
   * omitted the machine treats the release as happening on empty canvas.
   */
  readonly target?: PressTarget;
}
export interface PointerCancelEvent {
  readonly type: "POINTER_CANCEL";
}
export interface SetModeEvent {
  readonly type: "SET_MODE";
  readonly mode: Mode;
}

export type InteractionEvent =
  | PointerDownEvent
  | PointerMoveEvent
  | PointerUpEvent
  | PointerCancelEvent
  | SetModeEvent;

/**
 * Effects emitted to the host (Editor). The machine never mutates the scene;
 * it only describes what should happen.
 */
export type InteractionEmit =
  | { readonly type: "SELECT_REPLACE"; readonly id: ElementId }
  | { readonly type: "SELECT_TOGGLE"; readonly id: ElementId }
  | { readonly type: "SELECT_CLEAR" }
  | {
      readonly type: "LASSO_PROGRESS";
      readonly bounds: Bounds;
      /** Same modifier semantics as `SELECT_BY_BOUNDS.mode` — lets the
       * editor preview the additive variant of the lasso while the
       * gesture is still in progress. */
      readonly mode: "replace" | "add";
    }
  | { readonly type: "LASSO_CLEAR" }
  | {
      readonly type: "SELECT_BY_BOUNDS";
      readonly bounds: Bounds;
      /** Add to existing selection (Shift/Cmd lasso) or replace. */
      readonly mode: "replace" | "add";
    }
  | { readonly type: "SELECT_EDGE_REPLACE"; readonly id: LinkId }
  | { readonly type: "SELECT_EDGE_CLEAR" }
  | {
      readonly type: "UPDATE_EDGE_ENDPOINT_PREVIEW";
      readonly linkId: LinkId;
      readonly side: "from" | "to";
      readonly toPoint: Vec2;
    }
  | {
      readonly type: "UPDATE_EDGE_ENDPOINT";
      readonly linkId: LinkId;
      readonly side: "from" | "to";
      readonly toPoint: Vec2;
      readonly toShape: ElementId | null;
    }
  | {
      readonly type: "MOVE_SHAPE";
      readonly id: ElementId;
      readonly delta: Vec2;
      readonly originalBounds: Bounds;
    }
  | {
      readonly type: "MOVE_ANNOTATION";
      readonly id: AnnotationId;
      readonly delta: Vec2;
      readonly originalPosition: Vec2;
    }
  | {
      readonly type: "COMMIT_ANNOTATION_DRAG";
      readonly id: AnnotationId;
    }
  | {
      readonly type: "RESIZE_SHAPE";
      readonly id: ElementId;
      readonly handle: HandleId;
      readonly delta: Vec2;
      readonly originalBounds: Bounds;
    }
  | {
      /**
       * Resize emit for a multi-selection's combined bounding box.
       * Editor reads the press-down snapshot it kept and rescales every
       * member proportionally. Single per-frame emit regardless of group
       * size — the math is host-side.
       */
      readonly type: "RESIZE_GROUP";
      readonly handle: HandleId;
      readonly delta: Vec2;
      readonly originalBounds: Bounds;
    }
  | {
      readonly type: "CREATE_SHAPE";
      readonly shapeType: "rect" | "ellipse" | "frame";
      readonly bounds: Bounds;
    }
  | {
      readonly type: "CREATE_EDGE";
      /** Shape the edge starts on, or `null` for a free-floating point. */
      readonly fromShape: ElementId | null;
      /** Shape the edge lands on, or `null` for a free-floating point. */
      readonly toShape: ElementId | null;
      /** Press-down world point — used as the fallback when `fromShape` is null. */
      readonly fromPoint: Vec2;
      /** Pointer-up world point — used as the fallback when `toShape` is null. */
      readonly toPoint: Vec2;
    }
  | {
      readonly type: "DRAW_EDGE_PREVIEW";
      readonly fromShape: ElementId | null;
      readonly fromPoint: Vec2;
      readonly toPoint: Vec2;
    }
  | { readonly type: "DRAW_EDGE_PREVIEW_CLEAR" }
  | {
      readonly type: "TEMPLATE_TAP";
      readonly elementId: ElementId;
      /** Action identifier from the tapped node (e.g. button `action`). */
      readonly action: string;
      /** Optional node id from the template tree. */
      readonly nodeId?: string;
    }
  | {
      readonly type: "TEMPLATE_DROP";
      /** Template shape that owns the drop-zone. */
      readonly elementId: ElementId;
      /** Id of the drop-zone node within the template tree. */
      readonly nodeId?: string;
      /** Template-id from the DOM `application/x-template-id` payload, if any. */
      readonly templateId: string | null;
      /** World coordinates where the drop happened. */
      readonly point: Vec2;
    };

/** Pixels of pointer travel before a press becomes a drag. */
export const DRAG_THRESHOLD = 4;

const dragExceeded = (origin: Vec2, current: Vec2): boolean => {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  return dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD;
};

const boundsFromPoints = (a: Vec2, b: Vec2): Bounds => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
};

export const interactionMachine = setup({
  types: {
    context: {} as InteractionContext,
    events: {} as InteractionEvent,
    emitted: {} as InteractionEmit,
  },
  actions: {
    startPress: assign(
      (_, params: { point: Vec2; target: PressTarget; modifiers: Modifiers | null }) => ({
        pressOrigin: params.point,
        pressLast: params.point,
        pressTarget: params.target,
        pressModifiers: params.modifiers,
      }),
    ),
    updateLast: assign((_, params: { point: Vec2 }) => ({ pressLast: params.point })),
    setDrawingType: assign((_, params: { kind: "rect" | "ellipse" | "frame" }) => ({
      drawingType: params.kind,
    })),
    resetGesture: assign(() => ({
      pressOrigin: null,
      pressLast: null,
      pressTarget: null,
      drawingType: null,
      pressModifiers: null,
    })),
    setMode: assign((_, params: { mode: Mode }) => ({ mode: params.mode })),
    emitMoveShape: enqueueActions(({ context, event, enqueue }) => {
      if (
        event.type !== "POINTER_MOVE" ||
        !context.pressOrigin ||
        context.pressTarget?.kind !== "shape"
      ) {
        return;
      }
      enqueue.emit({
        type: "MOVE_SHAPE",
        id: context.pressTarget.id,
        delta: {
          x: event.point.x - context.pressOrigin.x,
          y: event.point.y - context.pressOrigin.y,
        },
        originalBounds: context.pressTarget.bounds,
      });
    }),
    emitMoveAnnotation: enqueueActions(({ context, event, enqueue }) => {
      if (
        event.type !== "POINTER_MOVE" ||
        !context.pressOrigin ||
        context.pressTarget?.kind !== "annotation"
      ) {
        return;
      }
      enqueue.emit({
        type: "MOVE_ANNOTATION",
        id: context.pressTarget.id,
        delta: {
          x: event.point.x - context.pressOrigin.x,
          y: event.point.y - context.pressOrigin.y,
        },
        originalPosition: context.pressTarget.origin,
      });
    }),
    emitCommitAnnotationDrag: enqueueActions(({ context, enqueue }) => {
      if (context.pressTarget?.kind !== "annotation") return;
      enqueue.emit({ type: "COMMIT_ANNOTATION_DRAG", id: context.pressTarget.id });
    }),
    emitResizeShape: enqueueActions(({ context, event, enqueue }) => {
      if (
        event.type !== "POINTER_MOVE" ||
        !context.pressOrigin ||
        context.pressTarget?.kind !== "handle"
      ) {
        return;
      }
      enqueue.emit({
        type: "RESIZE_SHAPE",
        id: context.pressTarget.elementId,
        handle: context.pressTarget.handle,
        delta: {
          x: event.point.x - context.pressOrigin.x,
          y: event.point.y - context.pressOrigin.y,
        },
        originalBounds: context.pressTarget.bounds,
      });
    }),
    emitResizeGroup: enqueueActions(({ context, event, enqueue }) => {
      if (
        event.type !== "POINTER_MOVE" ||
        !context.pressOrigin ||
        context.pressTarget?.kind !== "group-handle"
      ) {
        return;
      }
      enqueue.emit({
        type: "RESIZE_GROUP",
        handle: context.pressTarget.handle,
        delta: {
          x: event.point.x - context.pressOrigin.x,
          y: event.point.y - context.pressOrigin.y,
        },
        originalBounds: context.pressTarget.bounds,
      });
    }),
    maybeEmitCreate: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== "POINTER_UP" || !context.pressOrigin || !context.drawingType) {
        return;
      }
      const bounds = boundsFromPoints(context.pressOrigin, event.point);
      if (bounds.width < 1 || bounds.height < 1) return;
      enqueue.emit({ type: "CREATE_SHAPE", shapeType: context.drawingType, bounds });
    }),
    emitEdgePreview: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return;
      enqueue.emit({
        type: "DRAW_EDGE_PREVIEW",
        fromShape: context.pressTarget?.kind === "shape" ? context.pressTarget.id : null,
        fromPoint: context.pressOrigin,
        toPoint: event.point,
      });
    }),
    emitEdgePreviewClear: enqueueActions(({ enqueue }) => {
      enqueue.emit({ type: "DRAW_EDGE_PREVIEW_CLEAR" });
    }),
    emitEdgeEndpointPreview: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return;
      if (context.pressTarget?.kind !== "edge-endpoint") return;
      enqueue.emit({
        type: "UPDATE_EDGE_ENDPOINT_PREVIEW",
        linkId: context.pressTarget.linkId,
        side: context.pressTarget.side,
        toPoint: event.point,
      });
    }),
    emitEdgeEndpointUpdate: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== "POINTER_UP" || !context.pressOrigin) return;
      if (context.pressTarget?.kind !== "edge-endpoint") return;
      const upTarget = event.target;
      const toShape = upTarget?.kind === "shape" ? upTarget.id : null;
      enqueue.emit({
        type: "UPDATE_EDGE_ENDPOINT",
        linkId: context.pressTarget.linkId,
        side: context.pressTarget.side,
        toPoint: event.point,
        toShape,
      });
    }),
    emitLassoProgress: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return;
      const m = context.pressModifiers;
      const additive = Boolean(m && (m.shift || m.meta || m.ctrl));
      enqueue.emit({
        type: "LASSO_PROGRESS",
        bounds: boundsFromPoints(context.pressOrigin, event.point),
        mode: additive ? "add" : "replace",
      });
    }),
    emitLassoCommit: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== "POINTER_UP" || !context.pressOrigin) return;
      const bounds = boundsFromPoints(context.pressOrigin, event.point);
      // Tiny rectangles are click-style noise — ignore.
      if (bounds.width < 1 && bounds.height < 1) {
        enqueue.emit({ type: "LASSO_CLEAR" });
        return;
      }
      const m = context.pressModifiers;
      const additive = Boolean(m && (m.shift || m.meta || m.ctrl));
      enqueue.emit({ type: "SELECT_BY_BOUNDS", bounds, mode: additive ? "add" : "replace" });
      enqueue.emit({ type: "LASSO_CLEAR" });
    }),
    emitCreateEdge: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== "POINTER_UP" || !context.pressOrigin) return;
      // `event.target` carries the *up*-side hit-test (host computed it
      // the same way as POINTER_DOWN). Use it to land on a shape if the
      // pointer is still over one.
      const upTarget = event.target;
      const toShape = upTarget?.kind === "shape" ? upTarget.id : null;
      const fromShape = context.pressTarget?.kind === "shape" ? context.pressTarget.id : null;
      // Reject degenerate (released right back on the source shape without
      // moving — clearly an accidental click).
      const dx = event.point.x - context.pressOrigin.x;
      const dy = event.point.y - context.pressOrigin.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      enqueue.emit({
        type: "CREATE_EDGE",
        fromShape,
        toShape,
        fromPoint: context.pressOrigin,
        toPoint: event.point,
      });
    }),
  },
  guards: {
    movedAndOnShape: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.pressTarget?.kind !== "shape") return false;
      // Dragging-on-shape moves the shape — only valid in `select` mode.
      // In `draw-edge` mode the same gesture starts an edge from the shape.
      if (context.mode !== "select") return false;
      return dragExceeded(context.pressOrigin, event.point);
    },
    movedAndOnHandle: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.pressTarget?.kind !== "handle") return false;
      return dragExceeded(context.pressOrigin, event.point);
    },
    movedAndOnGroupHandle: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.pressTarget?.kind !== "group-handle") return false;
      return dragExceeded(context.pressOrigin, event.point);
    },
    movedAndDrawing: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (
        context.mode !== "draw-rect" &&
        context.mode !== "draw-ellipse" &&
        context.mode !== "draw-frame"
      ) {
        return false;
      }
      return dragExceeded(context.pressOrigin, event.point);
    },
    movedAndDrawingEdge: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.mode !== "draw-edge") return false;
      return dragExceeded(context.pressOrigin, event.point);
    },
    movedAndOnEdgeEndpoint: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.pressTarget?.kind !== "edge-endpoint") return false;
      return dragExceeded(context.pressOrigin, event.point);
    },
    movedAndOnAnnotation: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.pressTarget?.kind !== "annotation") return false;
      // Annotation pins live above shapes — drag works in select
      // mode (default) and stays away from drawing modes so a user
      // sketching a new shape doesn't accidentally grab a pin.
      if (context.mode !== "select") return false;
      return dragExceeded(context.pressOrigin, event.point);
    },
    movedAndLasso: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.mode !== "select") return false;
      if (context.pressTarget?.kind !== "empty") return false;
      return dragExceeded(context.pressOrigin, event.point);
    },
  },
}).createMachine({
  id: "interaction",
  initial: "idle",
  context: initialContext(),
  on: {
    SET_MODE: {
      target: ".idle",
      actions: [
        { type: "setMode", params: ({ event }) => ({ mode: event.mode }) },
        { type: "resetGesture" },
      ],
    },
  },
  states: {
    idle: {
      on: {
        POINTER_DOWN: {
          target: "pressing",
          actions: [
            {
              type: "startPress",
              params: ({ event }) => ({
                point: event.point,
                target: event.target,
                modifiers: event.modifiers ?? null,
              }),
            },
          ],
        },
      },
    },
    pressing: {
      on: {
        POINTER_MOVE: [
          {
            guard: "movedAndOnHandle",
            target: "draggingHandle",
            actions: [
              { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
              { type: "emitResizeShape" },
            ],
          },
          {
            guard: "movedAndOnGroupHandle",
            target: "draggingGroupHandle",
            actions: [
              { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
              { type: "emitResizeGroup" },
            ],
          },
          {
            guard: "movedAndOnShape",
            target: "draggingShape",
            actions: [
              { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
              { type: "emitMoveShape" },
            ],
          },
          {
            guard: "movedAndDrawing",
            target: "drawing",
            actions: [
              {
                type: "setDrawingType",
                params: ({ context }) => ({
                  kind:
                    context.mode === "draw-rect"
                      ? "rect"
                      : context.mode === "draw-frame"
                        ? "frame"
                        : "ellipse",
                }),
              },
              { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
            ],
          },
          {
            guard: "movedAndDrawingEdge",
            target: "drawingEdge",
            actions: [
              { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
              { type: "emitEdgePreview" },
            ],
          },
          {
            guard: "movedAndOnEdgeEndpoint",
            target: "draggingEdgeEndpoint",
            actions: [
              { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
              { type: "emitEdgeEndpointPreview" },
            ],
          },
          {
            guard: "movedAndOnAnnotation",
            target: "draggingAnnotation",
            actions: [
              { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
              { type: "emitMoveAnnotation" },
            ],
          },
          {
            guard: "movedAndLasso",
            target: "lassoing",
            actions: [
              { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
              { type: "emitLassoProgress" },
            ],
          },
          {
            actions: [{ type: "updateLast", params: ({ event }) => ({ point: event.point }) }],
          },
        ],
        POINTER_UP: { target: "idle", actions: [{ type: "resetGesture" }] },
        POINTER_CANCEL: { target: "idle", actions: [{ type: "resetGesture" }] },
      },
    },
    draggingShape: {
      on: {
        POINTER_MOVE: {
          actions: [
            { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
            { type: "emitMoveShape" },
          ],
        },
        POINTER_UP: { target: "idle", actions: [{ type: "resetGesture" }] },
        POINTER_CANCEL: { target: "idle", actions: [{ type: "resetGesture" }] },
      },
    },
    draggingHandle: {
      on: {
        POINTER_MOVE: {
          actions: [
            { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
            { type: "emitResizeShape" },
          ],
        },
        POINTER_UP: { target: "idle", actions: [{ type: "resetGesture" }] },
        POINTER_CANCEL: { target: "idle", actions: [{ type: "resetGesture" }] },
      },
    },
    draggingGroupHandle: {
      on: {
        POINTER_MOVE: {
          actions: [
            { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
            { type: "emitResizeGroup" },
          ],
        },
        POINTER_UP: { target: "idle", actions: [{ type: "resetGesture" }] },
        POINTER_CANCEL: { target: "idle", actions: [{ type: "resetGesture" }] },
      },
    },
    drawing: {
      on: {
        POINTER_MOVE: {
          actions: [{ type: "updateLast", params: ({ event }) => ({ point: event.point }) }],
        },
        POINTER_UP: {
          target: "idle",
          actions: [{ type: "maybeEmitCreate" }, { type: "resetGesture" }],
        },
        POINTER_CANCEL: { target: "idle", actions: [{ type: "resetGesture" }] },
      },
    },
    drawingEdge: {
      on: {
        POINTER_MOVE: {
          actions: [
            { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
            { type: "emitEdgePreview" },
          ],
        },
        POINTER_UP: {
          target: "idle",
          actions: [
            { type: "emitCreateEdge" },
            { type: "emitEdgePreviewClear" },
            { type: "resetGesture" },
          ],
        },
        POINTER_CANCEL: {
          target: "idle",
          actions: [{ type: "emitEdgePreviewClear" }, { type: "resetGesture" }],
        },
      },
    },
    draggingEdgeEndpoint: {
      on: {
        POINTER_MOVE: {
          actions: [
            { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
            { type: "emitEdgeEndpointPreview" },
          ],
        },
        POINTER_UP: {
          target: "idle",
          actions: [{ type: "emitEdgeEndpointUpdate" }, { type: "resetGesture" }],
        },
        POINTER_CANCEL: { target: "idle", actions: [{ type: "resetGesture" }] },
      },
    },
    draggingAnnotation: {
      on: {
        POINTER_MOVE: {
          actions: [
            { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
            { type: "emitMoveAnnotation" },
          ],
        },
        POINTER_UP: {
          target: "idle",
          actions: [{ type: "emitCommitAnnotationDrag" }, { type: "resetGesture" }],
        },
        POINTER_CANCEL: { target: "idle", actions: [{ type: "resetGesture" }] },
      },
    },
    lassoing: {
      on: {
        POINTER_MOVE: {
          actions: [
            { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
            { type: "emitLassoProgress" },
          ],
        },
        POINTER_UP: {
          target: "idle",
          actions: [{ type: "emitLassoCommit" }, { type: "resetGesture" }],
        },
        POINTER_CANCEL: {
          target: "idle",
          actions: [
            {
              type: "emitLassoCommit" /* fires LASSO_CLEAR only */,
            },
            { type: "resetGesture" },
          ],
        },
      },
    },
  },
});

/**
 * Host-side helper: decide whether POINTER_UP from `pressing` should produce
 * a click-style effect (SELECT_REPLACE / SELECT_CLEAR). The machine emits
 * dragging-effects directly; click effects are handled here because they
 * depend on the up-point relative to the press origin, which the host
 * computes the same way for both branches.
 */
export const interpretPressEnd = (
  ctx: InteractionContext,
  upPoint: Vec2,
): InteractionEmit | null => {
  if (!ctx.pressOrigin || !ctx.pressTarget) return null;
  if (dragExceeded(ctx.pressOrigin, upPoint)) return null;
  // In draw-edge mode a click without movement shouldn't toggle selection —
  // the user is mid-mode and meant to start an edge.
  if (ctx.mode === "draw-edge") return null;
  if (ctx.pressTarget.kind === "shape") {
    // Shift / meta click toggles the shape's membership in the current
    // selection — every other modifier combination replaces.
    const m = ctx.pressModifiers;
    if (m && (m.shift || m.meta || m.ctrl)) {
      return { type: "SELECT_TOGGLE", id: ctx.pressTarget.id };
    }
    return { type: "SELECT_REPLACE", id: ctx.pressTarget.id };
  }
  if (ctx.pressTarget.kind === "edge") {
    return { type: "SELECT_EDGE_REPLACE", id: ctx.pressTarget.id };
  }
  if (ctx.pressTarget.kind === "empty" && ctx.mode === "select") {
    return { type: "SELECT_CLEAR" };
  }
  return null;
};

export { boundsFromPoints };
