import { createActor } from "xstate";
import { describe, expect, it, vi } from "vitest";
import { elementId } from "@oh-just-another/types";
import { interactionMachine, interpretPressEnd, type InteractionEmit } from "../src/machine";

const start = () => {
  const actor = createActor(interactionMachine);
  const emits: InteractionEmit[] = [];
  actor.on("*", (event) => emits.push(event));
  actor.start();
  return { actor, emits };
};

const rectTarget = (id = "a") => ({
  kind: "element" as const,
  id: elementId(id),
  bounds: { x: 0, y: 0, width: 100, height: 50 },
});

const handleTarget = (id = "a") => ({
  kind: "handle" as const,
  elementId: elementId(id),
  handle: "se" as const,
  bounds: { x: 0, y: 0, width: 100, height: 50 },
});

describe("interactionMachine", () => {
  describe("idle ↔ pressing", () => {
    it("POINTER_DOWN enters pressing", () => {
      const { actor } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 5, y: 5 }, target: rectTarget() });
      expect(actor.getSnapshot().value).toBe("pressing");
      expect(actor.getSnapshot().context.pressTarget).toEqual(rectTarget());
    });

    it("POINTER_UP without move returns to idle", () => {
      const { actor } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 5, y: 5 }, target: rectTarget() });
      actor.send({ type: "POINTER_UP", point: { x: 5, y: 5 } });
      expect(actor.getSnapshot().value).toBe("idle");
    });

    it("small POINTER_MOVE stays in pressing", () => {
      const { actor } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 5, y: 5 }, target: rectTarget() });
      actor.send({ type: "POINTER_MOVE", point: { x: 6, y: 6 } });
      expect(actor.getSnapshot().value).toBe("pressing");
    });
  });

  describe("dragging shape", () => {
    it("crossing drag threshold on a shape enters draggingElement", () => {
      const { actor } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 5, y: 5 }, target: rectTarget() });
      actor.send({ type: "POINTER_MOVE", point: { x: 100, y: 100 } });
      expect(actor.getSnapshot().value).toBe("draggingElement");
    });

    it("subsequent POINTER_MOVE emits MOVE_SHAPE with delta", () => {
      const { actor, emits } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 0, y: 0 }, target: rectTarget() });
      actor.send({ type: "POINTER_MOVE", point: { x: 10, y: 10 } });
      const move = emits.find((e) => e.type === "MOVE_SHAPE");
      expect(move).toBeDefined();
      if (move?.type === "MOVE_SHAPE") {
        expect(move.delta).toEqual({ x: 10, y: 10 });
        expect(move.id).toBe(elementId("a"));
      }
    });

    it("POINTER_UP returns to idle", () => {
      const { actor } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 0, y: 0 }, target: rectTarget() });
      actor.send({ type: "POINTER_MOVE", point: { x: 50, y: 0 } });
      actor.send({ type: "POINTER_UP", point: { x: 50, y: 0 } });
      expect(actor.getSnapshot().value).toBe("idle");
    });
  });

  describe("resize handle", () => {
    it("crossing threshold on a handle enters draggingHandle and emits RESIZE_SHAPE", () => {
      const { actor, emits } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 100, y: 50 }, target: handleTarget() });
      actor.send({ type: "POINTER_MOVE", point: { x: 110, y: 60 } });
      expect(actor.getSnapshot().value).toBe("draggingHandle");
      const resize = emits.find((e) => e.type === "RESIZE_SHAPE");
      expect(resize).toBeDefined();
      if (resize?.type === "RESIZE_SHAPE") {
        expect(resize.handle).toBe("se");
        expect(resize.delta).toEqual({ x: 10, y: 10 });
      }
    });
  });

  describe("drawing", () => {
    it("draw-rect mode + drag → drawing state", () => {
      const { actor } = start();
      actor.send({ type: "SET_MODE", mode: "draw-rect" });
      actor.send({ type: "POINTER_DOWN", point: { x: 0, y: 0 }, target: { kind: "empty" } });
      actor.send({ type: "POINTER_MOVE", point: { x: 30, y: 20 } });
      expect(actor.getSnapshot().value).toBe("drawing");
      expect(actor.getSnapshot().context.drawingType).toBe("rect");
    });

    it("POINTER_UP in drawing emits CREATE_SHAPE with the spanned bounds", () => {
      const { actor, emits } = start();
      actor.send({ type: "SET_MODE", mode: "draw-ellipse" });
      actor.send({ type: "POINTER_DOWN", point: { x: 5, y: 7 }, target: { kind: "empty" } });
      actor.send({ type: "POINTER_MOVE", point: { x: 50, y: 100 } });
      actor.send({ type: "POINTER_UP", point: { x: 50, y: 100 } });
      const create = emits.find((e) => e.type === "CREATE_SHAPE");
      expect(create).toBeDefined();
      if (create?.type === "CREATE_SHAPE") {
        expect(create.shapeType).toBe("ellipse");
        expect(create.bounds).toEqual({ x: 5, y: 7, width: 45, height: 93 });
      }
    });

    it("tiny draw (< 1px) does not emit", () => {
      const { actor, emits } = start();
      actor.send({ type: "SET_MODE", mode: "draw-rect" });
      actor.send({ type: "POINTER_DOWN", point: { x: 0, y: 0 }, target: { kind: "empty" } });
      actor.send({ type: "POINTER_MOVE", point: { x: 5, y: 5 } });
      actor.send({ type: "POINTER_UP", point: { x: 0.5, y: 0.5 } });
      expect(emits.find((e) => e.type === "CREATE_SHAPE")).toBeUndefined();
    });
  });

  describe("drawing edge", () => {
    it("draw-edge mode + drag → drawingLink state + DRAW_EDGE_PREVIEW emit", () => {
      const { actor, emits } = start();
      actor.send({ type: "SET_MODE", mode: "draw-edge" });
      actor.send({ type: "POINTER_DOWN", point: { x: 10, y: 10 }, target: rectTarget("a") });
      actor.send({ type: "POINTER_MOVE", point: { x: 80, y: 50 } });
      expect(actor.getSnapshot().value).toBe("drawingLink");
      const preview = emits.find((e) => e.type === "DRAW_EDGE_PREVIEW");
      expect(preview).toBeDefined();
      if (preview?.type === "DRAW_EDGE_PREVIEW") {
        expect(preview.fromElement).toBe(elementId("a"));
        expect(preview.toPoint).toEqual({ x: 80, y: 50 });
      }
    });

    it("POINTER_UP on another shape emits CREATE_EDGE with both endpoints anchored", () => {
      const { actor, emits } = start();
      actor.send({ type: "SET_MODE", mode: "draw-edge" });
      actor.send({ type: "POINTER_DOWN", point: { x: 10, y: 10 }, target: rectTarget("a") });
      actor.send({ type: "POINTER_MOVE", point: { x: 80, y: 50 } });
      actor.send({
        type: "POINTER_UP",
        point: { x: 200, y: 200 },
        target: rectTarget("b"),
      });
      const create = emits.find((e) => e.type === "CREATE_EDGE");
      expect(create).toBeDefined();
      if (create?.type === "CREATE_EDGE") {
        expect(create.fromElement).toBe(elementId("a"));
        expect(create.toElement).toBe(elementId("b"));
        expect(create.fromPoint).toEqual({ x: 10, y: 10 });
        expect(create.toPoint).toEqual({ x: 200, y: 200 });
      }
    });

    it("POINTER_UP on empty emits CREATE_EDGE with toElement=null", () => {
      const { actor, emits } = start();
      actor.send({ type: "SET_MODE", mode: "draw-edge" });
      actor.send({ type: "POINTER_DOWN", point: { x: 10, y: 10 }, target: rectTarget("a") });
      actor.send({ type: "POINTER_MOVE", point: { x: 80, y: 50 } });
      actor.send({
        type: "POINTER_UP",
        point: { x: 200, y: 200 },
        target: { kind: "empty" },
      });
      const create = emits.find((e) => e.type === "CREATE_EDGE");
      expect(create).toBeDefined();
      if (create?.type === "CREATE_EDGE") {
        expect(create.fromElement).toBe(elementId("a"));
        expect(create.toElement).toBeNull();
      }
    });

    it("releasing without movement does not emit", () => {
      const { actor, emits } = start();
      actor.send({ type: "SET_MODE", mode: "draw-edge" });
      actor.send({ type: "POINTER_DOWN", point: { x: 10, y: 10 }, target: rectTarget("a") });
      actor.send({ type: "POINTER_UP", point: { x: 10, y: 10 }, target: rectTarget("a") });
      expect(emits.find((e) => e.type === "CREATE_EDGE")).toBeUndefined();
    });

    it("POINTER_CANCEL clears the preview", () => {
      const { actor, emits } = start();
      actor.send({ type: "SET_MODE", mode: "draw-edge" });
      actor.send({ type: "POINTER_DOWN", point: { x: 10, y: 10 }, target: rectTarget("a") });
      actor.send({ type: "POINTER_MOVE", point: { x: 80, y: 50 } });
      actor.send({ type: "POINTER_CANCEL" });
      expect(actor.getSnapshot().value).toBe("idle");
      expect(emits.find((e) => e.type === "DRAW_EDGE_PREVIEW_CLEAR")).toBeDefined();
      expect(emits.find((e) => e.type === "CREATE_EDGE")).toBeUndefined();
    });
  });

  describe("SET_MODE", () => {
    it("returns to idle and updates mode", () => {
      const { actor } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 0, y: 0 }, target: rectTarget() });
      actor.send({ type: "SET_MODE", mode: "draw-rect" });
      expect(actor.getSnapshot().value).toBe("idle");
      expect(actor.getSnapshot().context.mode).toBe("draw-rect");
      expect(actor.getSnapshot().context.pressOrigin).toBeNull();
    });
  });

  describe("interpretPressEnd", () => {
    it("SELECT_REPLACE for a click on a shape", () => {
      const ctx = {
        mode: "select" as const,
        pressOrigin: { x: 0, y: 0 },
        pressLast: null,
        pressTarget: rectTarget(),
        drawingType: null,
        pressModifiers: null,
      };
      expect(interpretPressEnd(ctx, { x: 0, y: 0 })).toEqual({
        type: "SELECT_REPLACE",
        id: elementId("a"),
      });
    });
    it("SELECT_CLEAR for a click on empty in select mode", () => {
      const ctx = {
        mode: "select" as const,
        pressOrigin: { x: 0, y: 0 },
        pressLast: null,
        pressTarget: { kind: "empty" as const },
        drawingType: null,
        pressModifiers: null,
      };
      expect(interpretPressEnd(ctx, { x: 0, y: 0 })).toEqual({ type: "SELECT_CLEAR" });
    });
    it("null when the press has moved past threshold", () => {
      const ctx = {
        mode: "select" as const,
        pressOrigin: { x: 0, y: 0 },
        pressLast: null,
        pressTarget: rectTarget(),
        drawingType: null,
        pressModifiers: null,
      };
      expect(interpretPressEnd(ctx, { x: 100, y: 100 })).toBeNull();
    });

    it("SELECT_TOGGLE when shift is held", () => {
      const ctx = {
        mode: "select" as const,
        pressOrigin: { x: 0, y: 0 },
        pressLast: null,
        pressTarget: rectTarget(),
        drawingType: null,
        pressModifiers: { shift: true, ctrl: false, alt: false, meta: false },
      };
      expect(interpretPressEnd(ctx, { x: 0, y: 0 })).toEqual({
        type: "SELECT_TOGGLE",
        id: elementId("a"),
      });
    });

    it("SELECT_TOGGLE when meta is held", () => {
      const ctx = {
        mode: "select" as const,
        pressOrigin: { x: 0, y: 0 },
        pressLast: null,
        pressTarget: rectTarget(),
        drawingType: null,
        pressModifiers: { shift: false, ctrl: false, alt: false, meta: true },
      };
      expect(interpretPressEnd(ctx, { x: 0, y: 0 })).toEqual({
        type: "SELECT_TOGGLE",
        id: elementId("a"),
      });
    });
  });

  describe("lasso", () => {
    it("press on empty + drag in select mode enters lassoing + emits LASSO_PROGRESS", () => {
      const { actor, emits } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 0, y: 0 }, target: { kind: "empty" } });
      actor.send({ type: "POINTER_MOVE", point: { x: 50, y: 40 } });
      expect(actor.getSnapshot().value).toBe("lassoing");
      const prog = emits.find((e) => e.type === "LASSO_PROGRESS");
      expect(prog).toBeDefined();
      if (prog?.type === "LASSO_PROGRESS") {
        expect(prog.bounds).toEqual({ x: 0, y: 0, width: 50, height: 40 });
      }
    });

    it("POINTER_UP emits SELECT_BY_BOUNDS (replace) + LASSO_CLEAR", () => {
      const { actor, emits } = start();
      actor.send({ type: "POINTER_DOWN", point: { x: 0, y: 0 }, target: { kind: "empty" } });
      actor.send({ type: "POINTER_MOVE", point: { x: 50, y: 40 } });
      actor.send({ type: "POINTER_UP", point: { x: 50, y: 40 } });
      const sel = emits.find((e) => e.type === "SELECT_BY_BOUNDS");
      expect(sel).toBeDefined();
      if (sel?.type === "SELECT_BY_BOUNDS") {
        expect(sel.mode).toBe("replace");
        expect(sel.bounds).toEqual({ x: 0, y: 0, width: 50, height: 40 });
      }
      expect(emits.find((e) => e.type === "LASSO_CLEAR")).toBeDefined();
    });

    it("shift-lasso emits SELECT_BY_BOUNDS with mode=add", () => {
      const { actor, emits } = start();
      actor.send({
        type: "POINTER_DOWN",
        point: { x: 0, y: 0 },
        target: { kind: "empty" },
        modifiers: { shift: true, ctrl: false, alt: false, meta: false },
      });
      actor.send({ type: "POINTER_MOVE", point: { x: 50, y: 40 } });
      actor.send({ type: "POINTER_UP", point: { x: 50, y: 40 } });
      const sel = emits.find((e) => e.type === "SELECT_BY_BOUNDS");
      expect(sel?.type === "SELECT_BY_BOUNDS" && sel.mode).toBe("add");
    });
  });
});

// Suppress unused mock import warning when vi is imported but not used at this level.
void vi;
