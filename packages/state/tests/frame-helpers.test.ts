import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import {
  nextFrameName,
  assignFrameMembers,
  reconcileFrameMembership,
} from "../src/frame-helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseElement = (id: string, type: string, x: number, y: number, w = 20, h = 20): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type,
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#000" },
    width: w,
    height: h,
  }) as unknown as Element;

const rect = (id: string, x: number, y: number, w = 20, h = 20): Element =>
  baseElement(id, "rectangle", x, y, w, h);

const frame = (id: string, name: string, x = 0, y = 0, w = 200, h = 200): Element =>
  ({
    ...baseElement(id, "frame", x, y, w, h),
    name,
  }) as unknown as Element;

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const shape of elements) {
    s = apply(s, {
      kind: "element",
      id: shape.id,
      before: null,
      after: shape,
    } satisfies Patch);
  }
  return s;
};

/** Minimal HistoryProvider mock that captures pushed patches. */
const makeHistory = () => {
  const patches: unknown[] = [];
  // assignFrameMembers only calls `.push`; cast the minimal mock to the
  // full provider type (keeping `patches` visible for assertions).
  const h = { push: (p: unknown) => patches.push(p), patches };
  return h as unknown as Parameters<typeof assignFrameMembers>[1] & { patches: unknown[] };
};

// ---------------------------------------------------------------------------
// nextFrameName
// ---------------------------------------------------------------------------

describe("nextFrameName", () => {
  it("returns 'Frame 1' on an empty scene", () => {
    expect(nextFrameName(emptyScene())).toBe("Frame 1");
  });

  it("returns 'Frame 1' when no frames exist", () => {
    const scene = sceneWith(rect("r1", 0, 0));
    expect(nextFrameName(scene)).toBe("Frame 1");
  });

  it("increments above the highest existing Frame N name", () => {
    const f1 = frame("f1", "Frame 1");
    const f3 = frame("f3", "Frame 3");
    const scene = sceneWith(f1, f3);
    expect(nextFrameName(scene)).toBe("Frame 4");
  });

  it("ignores frames with non-standard names", () => {
    const namedFrame = frame("f1", "My Board");
    const scene = sceneWith(namedFrame);
    expect(nextFrameName(scene)).toBe("Frame 1");
  });

  it("handles a single frame named 'Frame 1' → returns 'Frame 2'", () => {
    const scene = sceneWith(frame("f1", "Frame 1"));
    expect(nextFrameName(scene)).toBe("Frame 2");
  });

  it("ignores non-frame elements even with 'Frame N' in name-like fields", () => {
    // A rectangle cannot have a `name` field that the pattern would match via
    // the `(s as any).name` cast — but if it did, the type guard
    // `s.type !== "frame"` should skip it.
    const notAFrame = { ...rect("r1", 0, 0), name: "Frame 99" } as Element;
    const scene = sceneWith(notAFrame);
    expect(nextFrameName(scene)).toBe("Frame 1");
  });
});

// ---------------------------------------------------------------------------
// assignFrameMembers
// ---------------------------------------------------------------------------

describe("assignFrameMembers", () => {
  it("assigns frameId to shapes whose centre is inside the frame bounds", () => {
    // Shape centred at (10, 10) — within [0,0,50,50].
    const shape = rect("s1", 0, 0, 20, 20); // centre (10, 10)
    const fId = elementId("frame1");
    const history = makeHistory();
    const scene = sceneWith(shape);
    const next = assignFrameMembers(scene, history, fId, { x: 0, y: 0, width: 50, height: 50 });
    expect(next.elements.get(shape.id)?.frameId).toBe(fId);
    expect(history.patches.length).toBe(1);
  });

  it("does NOT assign frameId to shapes whose centre is outside the frame bounds", () => {
    // Shape centred at (110, 110) — outside [0,0,50,50].
    const shape = rect("s1", 100, 100, 20, 20);
    const fId = elementId("frame1");
    const history = makeHistory();
    const scene = sceneWith(shape);
    const next = assignFrameMembers(scene, history, fId, { x: 0, y: 0, width: 50, height: 50 });
    expect(next.elements.get(shape.id)?.frameId).toBeUndefined();
    expect(history.patches.length).toBe(0);
  });

  it("skips the frame element itself", () => {
    const f = frame("f1", "Frame 1", 0, 0, 200, 200);
    const fId = f.id;
    const history = makeHistory();
    const scene = sceneWith(f);
    const next = assignFrameMembers(scene, history, fId, { x: 0, y: 0, width: 200, height: 200 });
    expect(next.elements.get(fId)?.frameId).toBeUndefined();
    expect(history.patches.length).toBe(0);
  });

  it("skips nested frame elements (type === 'frame')", () => {
    // Another frame inside the bounds should be skipped.
    const f2 = frame("f2", "Frame 2", 10, 10, 50, 50);
    const fId = elementId("f1");
    const history = makeHistory();
    const scene = sceneWith(f2);
    const next = assignFrameMembers(scene, history, fId, { x: 0, y: 0, width: 200, height: 200 });
    expect(next.elements.get(f2.id)?.frameId).toBeUndefined();
    expect(history.patches.length).toBe(0);
  });

  it("skips shapes already owned by another frame", () => {
    const alreadyOwned: Element = { ...rect("s1", 5, 5, 10, 10), frameId: elementId("other") };
    const fId = elementId("frame1");
    const history = makeHistory();
    const scene = sceneWith(alreadyOwned);
    const next = assignFrameMembers(scene, history, fId, { x: 0, y: 0, width: 100, height: 100 });
    // frameId must remain pointing at the original owner
    expect(next.elements.get(alreadyOwned.id)?.frameId).toBe(elementId("other"));
    expect(history.patches.length).toBe(0);
  });

  it("handles a shape whose centre is exactly on the frame boundary (inclusive)", () => {
    // Shape at x=40, w=20 → centre=50; frame right edge=50. cx <= right → inside.
    const shape = rect("s1", 40, 0, 20, 20); // centre (50, 10)
    const fId = elementId("frame1");
    const history = makeHistory();
    const scene = sceneWith(shape);
    const next = assignFrameMembers(scene, history, fId, { x: 0, y: 0, width: 50, height: 50 });
    // centre cx=50 == right=50, cy=10 < bottom=50 → inside
    expect(next.elements.get(shape.id)?.frameId).toBe(fId);
  });

  it("assigns to multiple shapes when all fall inside", () => {
    const a = rect("a", 0, 0, 20, 20); // centre (10, 10)
    const b = rect("b", 30, 30, 20, 20); // centre (40, 40)
    const fId = elementId("f1");
    const history = makeHistory();
    const scene = sceneWith(a, b);
    const next = assignFrameMembers(scene, history, fId, { x: 0, y: 0, width: 60, height: 60 });
    expect(next.elements.get(a.id)?.frameId).toBe(fId);
    expect(next.elements.get(b.id)?.frameId).toBe(fId);
    expect(history.patches.length).toBe(2);
  });
});

describe("reconcileFrameMembership (membership on drop)", () => {
  it("assigns an element whose centre is inside a frame (even if created later)", () => {
    const f = frame("F", "Frame 1", 0, 0, 200, 200);
    const inside = rect("s1", 80, 80, 20, 20); // centre (90,90) inside
    const scene = sceneWith(f, inside);
    const history = makeHistory();
    const next = reconcileFrameMembership(scene, history);
    expect(next.elements.get(inside.id)?.frameId).toBe(f.id);
  });

  it("releases an element dragged out of its frame (centre now outside)", () => {
    const f = frame("F", "Frame 1", 0, 0, 200, 200);
    const moved: Element = { ...rect("s1", 400, 400, 20, 20), frameId: elementId("F") };
    const scene = sceneWith(f, moved);
    const history = makeHistory();
    const next = reconcileFrameMembership(scene, history);
    expect(next.elements.get(moved.id)?.frameId).toBeUndefined();
  });

  it("is a no-op (no patches) when membership already matches geometry", () => {
    const f = frame("F", "Frame 1", 0, 0, 200, 200);
    const owned: Element = { ...rect("s1", 80, 80, 20, 20), frameId: elementId("F") };
    const outside = rect("s2", 400, 400, 20, 20); // already no frameId, stays out
    const scene = sceneWith(f, owned, outside);
    const history = makeHistory();
    reconcileFrameMembership(scene, history);
    expect(history.patches.length).toBe(0);
  });

  it("picks the top-most frame when frames overlap", () => {
    // f2 drawn after f1 (higher fractional order) and overlapping it.
    const f1: Element = { ...frame("F1", "Frame 1", 0, 0, 200, 200), order: orderBetween(null, null) };
    const f2: Element = {
      ...frame("F2", "Frame 2", 50, 50, 200, 200),
      order: orderBetween(f1.order, null),
    };
    const inside = rect("s1", 90, 90, 20, 20); // centre (100,100) inside both
    const scene = sceneWith(f1, f2, inside);
    const history = makeHistory();
    const next = reconcileFrameMembership(scene, history);
    // f2 has the higher fractional order (added last) → wins.
    expect(next.elements.get(inside.id)?.frameId).toBe(f2.id);
  });
});
