/**
 * xstate v5 re-entrant `send` semantics that govern `commitGesture()` →
 * notify ordering. `applyCreate` runs inside `actor.on("*")` and calls
 * `setMode("select")`, which itself sends `SET_MODE`. A re-entrant send
 * read in the same handler sees the old mode; after a microtask the mode
 * is updated.
 */

import { describe, expect, it } from "vitest";
import { interactionMachine } from "../src/machine.js";
import { createActor } from "xstate";

describe("xstate re-entrant send", () => {
  const playDrawRect = (actor: ReturnType<typeof createActor<typeof interactionMachine>>) => {
    actor.send({ type: "SET_MODE", mode: "draw-rect" });
    actor.send({ type: "POINTER_DOWN", point: { x: 0, y: 0 }, target: { kind: "empty" } });
    actor.send({ type: "POINTER_MOVE", point: { x: 30, y: 30 } });
    actor.send({ type: "POINTER_UP", point: { x: 30, y: 30 } });
  };

  it("re-entrant send from actor.on handler sees OLD mode immediately", () => {
    const actor = createActor(interactionMachine);
    actor.start();

    let modeAfterReentrantSend: string | null = null;
    actor.on("*", (ev) => {
      if (ev.type !== "CREATE_SHAPE") return;
      actor.send({ type: "SET_MODE", mode: "select" });
      modeAfterReentrantSend = actor.getSnapshot().context.mode;
    });
    playDrawRect(actor);
    expect(modeAfterReentrantSend).toBe("draw-rect");
  });

  it("mode IS up-to-date right after the outer send returns", () => {
    const actor = createActor(interactionMachine);
    actor.start();
    actor.on("*", (ev) => {
      if (ev.type !== "CREATE_SHAPE") return;
      actor.send({ type: "SET_MODE", mode: "select" });
    });
    playDrawRect(actor);
    // The synthetic `playDrawRect` ends with POINTER_UP; xstate
    // drains the queued SET_MODE before that outer send returns.
    expect(actor.getSnapshot().context.mode).toBe("select");
  });

  it("mode IS up-to-date after a microtask", async () => {
    const actor = createActor(interactionMachine);
    actor.start();
    actor.on("*", (ev) => {
      if (ev.type !== "CREATE_SHAPE") return;
      actor.send({ type: "SET_MODE", mode: "select" });
    });
    playDrawRect(actor);
    await Promise.resolve();
    expect(actor.getSnapshot().context.mode).toBe("select");
  });
});
