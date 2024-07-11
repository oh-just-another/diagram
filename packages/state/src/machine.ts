import { assign, enqueueActions, setup } from "xstate";
import type { Bounds, ShapeId, Vec2 } from "@oh-just-another/types";
import type { HandleId } from "./handle";
import { DEFAULT_MODE, type Mode } from "./modes";

/**
 * What the pointer landed on when the user pressed it down. The host computes
 * this synchronously on POINTER_DOWN (via scene queries + handle hit-test) and
 * hands it to the machine, which decides how to interpret the gesture from
 * that point on.
 */
export type PressTarget =
  | { readonly kind: "shape"; readonly id: ShapeId; readonly bounds: Bounds }
  | {
      readonly kind: "handle";
      readonly shapeId: ShapeId;
      readonly handle: HandleId;
      readonly bounds: Bounds;
    }
  | { readonly kind: "empty" };

export interface InteractionContext {
  readonly mode: Mode;
  readonly pressOrigin: Vec2 | null;
  readonly pressLast: Vec2 | null;
  readonly pressTarget: PressTarget | null;
  readonly drawingType: "rect" | "ellipse" | null;
}

const initialContext = (): InteractionContext => ({
  mode: DEFAULT_MODE,
  pressOrigin: null,
  pressLast: null,
  pressTarget: null,
  drawingType: null,
});

export interface PointerDownEvent {
  readonly type: "POINTER_DOWN";
  readonly point: Vec2;
  readonly target: PressTarget;
}
export interface PointerMoveEvent {
  readonly type: "POINTER_MOVE";
  readonly point: Vec2;
}
export interface PointerUpEvent {
  readonly type: "POINTER_UP";
  readonly point: Vec2;
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
  | { readonly type: "SELECT_REPLACE"; readonly id: ShapeId }
  | { readonly type: "SELECT_CLEAR" }
  | {
      readonly type: "MOVE_SHAPE";
      readonly id: ShapeId;
      readonly delta: Vec2;
      readonly originalBounds: Bounds;
    }
  | {
      readonly type: "RESIZE_SHAPE";
      readonly id: ShapeId;
      readonly handle: HandleId;
      readonly delta: Vec2;
      readonly originalBounds: Bounds;
    }
  | {
      readonly type: "CREATE_SHAPE";
      readonly shapeType: "rect" | "ellipse";
      readonly bounds: Bounds;
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
    startPress: assign((_, params: { point: Vec2; target: PressTarget }) => ({
      pressOrigin: params.point,
      pressLast: params.point,
      pressTarget: params.target,
    })),
    updateLast: assign((_, params: { point: Vec2 }) => ({ pressLast: params.point })),
    setDrawingType: assign((_, params: { kind: "rect" | "ellipse" }) => ({
      drawingType: params.kind,
    })),
    resetGesture: assign(() => ({
      pressOrigin: null,
      pressLast: null,
      pressTarget: null,
      drawingType: null,
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
        id: context.pressTarget.shapeId,
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
  },
  guards: {
    movedAndOnShape: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.pressTarget?.kind !== "shape") return false;
      return dragExceeded(context.pressOrigin, event.point);
    },
    movedAndOnHandle: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.pressTarget?.kind !== "handle") return false;
      return dragExceeded(context.pressOrigin, event.point);
    },
    movedAndDrawing: ({ context, event }) => {
      if (event.type !== "POINTER_MOVE" || !context.pressOrigin) return false;
      if (context.mode === "select") return false;
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
              params: ({ event }) => ({ point: event.point, target: event.target }),
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
                  kind: context.mode === "draw-rect" ? "rect" : "ellipse",
                }),
              },
              { type: "updateLast", params: ({ event }) => ({ point: event.point }) },
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
  if (ctx.pressTarget.kind === "shape") {
    return { type: "SELECT_REPLACE", id: ctx.pressTarget.id };
  }
  if (ctx.pressTarget.kind === "empty" && ctx.mode === "select") {
    return { type: "SELECT_CLEAR" };
  }
  return null;
};

export { boundsFromPoints };
