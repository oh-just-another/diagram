import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { CollabAwareness } from "../src/awareness";

interface AwarenessChange {
  added: number[];
  updated: number[];
  removed: number[];
}

const wireTogether = (a: CollabAwareness, b: CollabAwareness): void => {
  a.awareness.on("update", (changes: AwarenessChange, origin: unknown) => {
    if (origin === "remote") return;
    const update = encodeAwarenessUpdate(a.awareness, [
      ...changes.added,
      ...changes.updated,
      ...changes.removed,
    ]);
    applyAwarenessUpdate(b.awareness, update, "remote");
  });
  b.awareness.on("update", (changes: AwarenessChange, origin: unknown) => {
    if (origin === "remote") return;
    const update = encodeAwarenessUpdate(b.awareness, [
      ...changes.added,
      ...changes.updated,
      ...changes.removed,
    ]);
    applyAwarenessUpdate(a.awareness, update, "remote");
  });
};

describe("CollabAwareness", () => {
  it("updateLocal + getPeers round-trip", () => {
    const docA = new Y.Doc();
    const a = new CollabAwareness(docA);
    a.updateLocal({ user: { id: "u1", name: "Alice", color: "#1a73e8" } });
    expect(a.getPeers()).toHaveLength(1);
    expect(a.getPeers()[0]?.user.name).toBe("Alice");
  });

  it("peers from two awareness instances merge", () => {
    const a = new CollabAwareness(new Y.Doc());
    const b = new CollabAwareness(new Y.Doc());
    wireTogether(a, b);

    a.updateLocal({ user: { id: "u1", name: "Alice", color: "#aaa" } });
    b.updateLocal({ user: { id: "u2", name: "Bob", color: "#bbb" } });

    expect(
      a
        .getPeers()
        .map((p) => p.user.name)
        .sort(),
    ).toEqual(["Alice", "Bob"]);
    expect(a.getOthers().map((p) => p.user.name)).toEqual(["Bob"]);
  });

  it("clearing selection removes it from payload", () => {
    const a = new CollabAwareness(new Y.Doc());
    a.updateLocal({
      user: { id: "u1", name: "A", color: "#000" },
      selection: ["s1", "s2"],
    });
    expect(a.getPeers()[0]?.selection).toEqual(["s1", "s2"]);
    a.updateLocal({ selection: null });
    expect(a.getPeers()[0]?.selection).toBeUndefined();
  });
});
