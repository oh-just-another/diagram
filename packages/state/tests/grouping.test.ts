import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const rect = (id: string, x: number, y: number, w = 20, h = 20): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: w,
  height: h,
});

const sceneWith = (...shapes: Element[]): Scene => {
  let s = emptyScene();
  for (const shape of shapes) {
    s = apply(s, {
      kind: "shape",
      id: shape.id,
      before: null,
      after: shape,
    } satisfies Patch);
  }
  return s;
};

const makeEditor = (scene: Scene): Editor => {
  const noopTarget = {
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    clear: () => {},
    setFill: () => {},
    setStroke: () => {},
    setStrokeWidth: () => {},
    setOpacity: () => {},
    setLineCap: () => {},
    setLineJoin: () => {},
    setDashArray: () => {},
    setFont: () => {},
    setTextAlign: () => {},
    setTextBaseline: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    rect: () => {},
    ellipse: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    drawImage: () => {},
    drawPoint: () => {},
  } as never;
  const host = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: {},
  } as never;
  const editor = new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });
  return editor;
};

describe("grouping", () => {
  it("groupSelected wraps multi-selection into a single group", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    const result = editor.groupSelected();
    expect(result.kind).toBe("grouped");
    if (result.kind !== "grouped") throw new Error("unreachable");
    const groupId = result.groupId;
    expect(editor.scene.shapes.get(groupId)?.type).toBe("group");
    expect(editor.scene.shapes.get(a.id)?.parentId).toBe(groupId);
    expect(editor.scene.shapes.get(b.id)?.parentId).toBe(groupId);
    // Selection is moved onto the group itself.
    expect([...editor.selection]).toEqual([groupId]);
  });

  it("groupSelected is a no-op on a single selection", () => {
    const a = rect("a", 0, 0);
    const editor = makeEditor(sceneWith(a));
    editor.setSelection(new Set([a.id]));
    const result = editor.groupSelected();
    expect(result.kind).toBe("noop");
    expect(editor.scene.shapes.get(a.id)?.parentId).toBeUndefined();
  });

  it("ungroup drops parent links and removes the group shape", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    const { kind, ...rest } = editor.groupSelected();
    if (kind !== "grouped") throw new Error("expected group");
    const { groupId } = rest as { groupId: typeof a.id };
    editor.setSelection(new Set([groupId]));
    editor.ungroup();
    expect(editor.scene.shapes.has(groupId)).toBe(false);
    expect(editor.scene.shapes.get(a.id)?.parentId).toBeUndefined();
    expect(editor.scene.shapes.get(b.id)?.parentId).toBeUndefined();
    expect(editor.selection.has(a.id)).toBe(true);
    expect(editor.selection.has(b.id)).toBe(true);
  });

  it("moveSelectionBy translates every group descendant", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    const { kind, ...rest } = editor.groupSelected();
    if (kind !== "grouped") throw new Error("expected group");
    const { groupId } = rest as { groupId: typeof a.id };
    editor.setSelection(new Set([groupId]));
    editor.moveSelectionBy({ x: 50, y: 10 });
    expect(editor.scene.shapes.get(a.id)?.position).toEqual({ x: 50, y: 10 });
    expect(editor.scene.shapes.get(b.id)?.position).toEqual({ x: 150, y: 10 });
  });

  it("nested groups: ungroup of outer (G2 = (G1 + C)) restores inner G1 = (A + B)", () => {
    // A + B grouped into G1, then G1 + C grouped into G2. Ungrouping G2
    // yields G1 and C as top-level — G1 stays intact with A and B as children.
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const c = rect("c", 200, 0);
    const editor = makeEditor(sceneWith(a, b, c));

    editor.setSelection(new Set([a.id, b.id]));
    const r1 = editor.groupSelected();
    if (r1.kind !== "grouped") throw new Error("expected G1");
    const g1Id = r1.groupId;

    editor.setSelection(new Set([g1Id, c.id]));
    const r2 = editor.groupSelected();
    if (r2.kind !== "grouped") throw new Error("expected G2");
    const g2Id = r2.groupId;

    // Pre-ungroup state: nested.
    expect(editor.scene.shapes.get(g1Id)?.parentId).toBe(g2Id);
    expect(editor.scene.shapes.get(c.id)?.parentId).toBe(g2Id);
    expect(editor.scene.shapes.get(a.id)?.parentId).toBe(g1Id);
    expect(editor.scene.shapes.get(b.id)?.parentId).toBe(g1Id);

    editor.setSelection(new Set([g2Id]));
    editor.ungroup();

    // G2 removed.
    expect(editor.scene.shapes.has(g2Id)).toBe(false);
    // G1 survives, no longer parented to G2.
    expect(editor.scene.shapes.has(g1Id)).toBe(true);
    expect(editor.scene.shapes.get(g1Id)?.parentId).toBeUndefined();
    // A, B still children of G1.
    expect(editor.scene.shapes.get(a.id)?.parentId).toBe(g1Id);
    expect(editor.scene.shapes.get(b.id)?.parentId).toBe(g1Id);
    // C un-parented.
    expect(editor.scene.shapes.get(c.id)?.parentId).toBeUndefined();
    // Selection picked up the direct ex-children of G2.
    expect(editor.selection.has(g1Id)).toBe(true);
    expect(editor.selection.has(c.id)).toBe(true);
  });

  it("nested groups: groupSelected with G1 and a sibling shape doesn't flatten G1", () => {
    // Verifies the "selectionRoots" path: only top-level group becomes a
    // child of the new group, not its descendants.
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const c = rect("c", 200, 0);
    const editor = makeEditor(sceneWith(a, b, c));
    editor.setSelection(new Set([a.id, b.id]));
    const r1 = editor.groupSelected();
    if (r1.kind !== "grouped") throw new Error("expected G1");
    const g1Id = r1.groupId;

    // Select G1 and C, then group again.
    editor.setSelection(new Set([g1Id, c.id]));
    const r2 = editor.groupSelected();
    if (r2.kind !== "grouped") throw new Error("expected G2");
    const g2Id = r2.groupId;

    // A and B must still be parented to G1, NOT to G2 directly.
    expect(editor.scene.shapes.get(a.id)?.parentId).toBe(g1Id);
    expect(editor.scene.shapes.get(b.id)?.parentId).toBe(g1Id);
    // G1 itself parented to G2; same for C.
    expect(editor.scene.shapes.get(g1Id)?.parentId).toBe(g2Id);
    expect(editor.scene.shapes.get(c.id)?.parentId).toBe(g2Id);
  });

  it("enterGroup + child click selects the inner shape (bypasses promote-to-root)", () => {
    // After entering a group, calling setSelection on a child must not be
    // auto-promoted back to the group.
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    const r = editor.groupSelected();
    if (r.kind !== "grouped") throw new Error("expected group");
    const groupId = r.groupId;

    editor.enterGroup(groupId);
    expect(editor.enteredGroup).toBe(groupId);

    editor.setSelection(new Set([a.id]));
    expect([...editor.selection]).toEqual([a.id]);
  });

  it("cancelInteraction (Esc) exits group isolation and clears selection", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    const r = editor.groupSelected();
    if (r.kind !== "grouped") throw new Error("expected group");
    editor.enterGroup(r.groupId);
    editor.setSelection(new Set([a.id]));

    editor.cancelInteraction();
    expect(editor.enteredGroup).toBe(null);
    expect(editor.selection.size).toBe(0);
  });

  it("enterGroup(null) is the explicit exit (independent of cancelInteraction)", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    const r = editor.groupSelected();
    if (r.kind !== "grouped") throw new Error("expected group");
    editor.enterGroup(r.groupId);
    expect(editor.enteredGroup).toBe(r.groupId);
    editor.enterGroup(null);
    expect(editor.enteredGroup).toBe(null);
    // Selection unchanged on a clean exit (only Esc clears).
    expect([...editor.selection]).toEqual([r.groupId]);
  });

  it("dim set excludes group descendants AND the current selection", () => {
    // Inside isolation, dim must skip both every descendant of the entered
    // group (so siblings stay readable) and the focus shape itself.
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const outside = rect("c", 500, 500);
    const editor = makeEditor(sceneWith(a, b, outside));
    editor.setSelection(new Set([a.id, b.id]));
    const r = editor.groupSelected();
    if (r.kind !== "grouped") throw new Error("expected group");
    const groupId = r.groupId;

    editor.enterGroup(groupId);
    editor.setSelection(new Set([a.id]));

    // The method is private; its contract is the source of truth for what
    // the renderer dims.
    const dim = (editor as unknown as {
      computeDimElements(id: typeof groupId): ReadonlySet<typeof a.id>;
    }).computeDimElements(groupId);

    expect(dim.has(a.id)).toBe(false);
    expect(dim.has(b.id)).toBe(false);
    expect(dim.has(outside.id)).toBe(true);
  });

  it("applyContainerDrop preserves group parentId after dragging a child", () => {
    // For a shape whose parent is a group (which has no container dropZone),
    // applyContainerDrop must not strip parentId.
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    const r = editor.groupSelected();
    if (r.kind !== "grouped") throw new Error("expected group");
    const groupId = r.groupId;

    // Simulate the editor's drag pipeline at the moment applyContainerDrop fires.
    (editor as unknown as { dragElementId: typeof a.id | null }).dragElementId = a.id;
    (editor as unknown as { applyContainerDrop(p: { x: number; y: number }): void }).applyContainerDrop({
      x: a.position.x,
      y: a.position.y,
    });

    // parentId must still point at the group.
    expect(editor.scene.shapes.get(a.id)?.parentId).toBe(groupId);
  });

  it("undo restores pre-group state", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    editor.groupSelected();
    editor.undo();
    expect(editor.scene.shapes.get(a.id)?.parentId).toBeUndefined();
    expect(editor.scene.shapes.get(b.id)?.parentId).toBeUndefined();
    const groupElements = [...editor.scene.shapes.values()].filter((s) => s.type === "group");
    expect(groupElements.length).toBe(0);
  });
});

describe("group lock / hide propagation", () => {
  it("locking a group locks every descendant for hit-test", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    const r = editor.groupSelected();
    if (r.kind !== "grouped") throw new Error("expected group");
    const groupId = r.groupId;

    // Mark the group locked directly on the scene.
    const before = editor.scene.shapes.get(groupId)!;
    const locked: Element = { ...before, locked: true };
    (editor as unknown as { _scene: Scene })._scene = {
      ...editor.scene,
      shapes: new Map(editor.scene.shapes).set(groupId, locked),
    };

    // Click on A should miss now (descendant of locked group).
    const target = (editor as unknown as { hitTest(p: { x: number; y: number }): { kind: string } }).hitTest({
      x: 10,
      y: 10,
    });
    expect(target.kind).toBe("empty");
  });

  it("hiding a group adds every descendant to the render hide set", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    const r = editor.groupSelected();
    if (r.kind !== "grouped") throw new Error("expected group");
    const groupId = r.groupId;

    const before = editor.scene.shapes.get(groupId)!;
    const hidden: Element = { ...before, hidden: true };
    (editor as unknown as { _scene: Scene })._scene = {
      ...editor.scene,
      shapes: new Map(editor.scene.shapes).set(groupId, hidden),
    };

    const hideSet = (editor as unknown as { computeHiddenElements(): ReadonlySet<typeof a.id> | undefined }).computeHiddenElements();
    expect(hideSet).toBeDefined();
    expect(hideSet!.has(groupId)).toBe(true);
    expect(hideSet!.has(a.id)).toBe(true);
    expect(hideSet!.has(b.id)).toBe(true);
  });
});

describe("auto-layout containers", () => {
  const containerWithAutoLayout = (kind: "grid" | "stack"): Element => ({
    id: elementId("parent"),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#fff" },
    width: 400,
    height: 400,
    metadata: {
      autoLayout:
        kind === "grid"
          ? { kind: "grid", cols: 2, gap: 10 }
          : { kind: "stack", direction: "horizontal", gap: 10 },
    },
  });

  const childOf = (id: string, parentId: ReturnType<typeof elementId>, x: number, y: number): Element => ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#aaa" },
    width: 50,
    height: 50,
    parentId,
  });

  it("runLayout(parent) arranges children of a grid-spec container", () => {
    const parent = containerWithAutoLayout("grid");
    const c1 = childOf("c1", parent.id, 999, 999);
    const c2 = childOf("c2", parent.id, 0, 0);
    const c3 = childOf("c3", parent.id, 200, 0);
    const editor = makeEditor(sceneWith(parent, c1, c2, c3));

    editor.runLayout(parent.id);

    // Cells are 50 + 10 = 60 wide/tall, parent origin 0,0.
    // Children are sorted by `order`; c1/c2/c3 all share orderBetween(null,null)
    // so the natural insertion order persists. Verify they landed on a 2×2 lattice.
    const positions = [c1, c2, c3].map((s) => editor.scene.shapes.get(s.id)!.position);
    expect(positions[0]).toEqual({ x: 0, y: 0 });
    expect(positions[1]).toEqual({ x: 60, y: 0 });
    expect(positions[2]).toEqual({ x: 0, y: 60 });
  });

  it("auto-runs layout when a child is added (microtask after addElement)", async () => {
    const parent = containerWithAutoLayout("stack");
    const editor = makeEditor(sceneWith(parent));
    editor.addElement(childOf("c1", parent.id, 999, 999));
    editor.addElement(childOf("c2", parent.id, 999, 999));
    // Auto-layout fires in a microtask after notify; await it.
    await Promise.resolve();

    const p1 = editor.scene.shapes.get(elementId("c1"))!.position;
    const p2 = editor.scene.shapes.get(elementId("c2"))!.position;
    expect(p1).toEqual({ x: 0, y: 0 });
    expect(p2).toEqual({ x: 60, y: 0 }); // 50 width + 10 gap
  });

  it("auto-layout fingerprint ignores pure position changes", async () => {
    // Manual nudge of a child after auto-layout fires must NOT trigger
    // another re-layout (children set unchanged).
    const parent = containerWithAutoLayout("stack");
    const c1 = childOf("c1", parent.id, 999, 999);
    const editor = makeEditor(sceneWith(parent, c1));
    editor.runLayout(parent.id);
    await Promise.resolve();
    const after1 = editor.scene.shapes.get(c1.id)!.position;
    expect(after1).toEqual({ x: 0, y: 0 });

    // Move the child manually.
    editor.setSelection(new Set([c1.id]));
    editor.moveSelectionBy({ x: 100, y: 50 });
    await Promise.resolve();
    // Position survived — auto-layout didn't snap it back.
    const after2 = editor.scene.shapes.get(c1.id)!.position;
    expect(after2).toEqual({ x: 100, y: 50 });
  });

  // The flow is: addElement → notify → AutoLayoutScheduler → runAutoLayout
  // (places child at dropZone.top-left) → per-child maybeGrowContainer
  // (computes whether to expand). A container with explicit padding receives
  // a child, runs auto-layout, and its `position` stays put.
  it("does not shift the container on add/runLayout when a child fits cleanly", async () => {
    const parent: Element = {
      ...containerWithAutoLayout("grid"),
      metadata: {
        autoLayout: { kind: "grid", cols: 2, gap: 10 },
        container: { padding: 12 },
      },
    };
    const editor = makeEditor(sceneWith(parent));
    const before = editor.scene.shapes.get(parent.id)!.position;

    editor.addElement(childOf("c1", parent.id, 999, 999));
    await Promise.resolve();
    expect(editor.scene.shapes.get(parent.id)!.position).toEqual(before);

    editor.addElement(childOf("c2", parent.id, 999, 999));
    await Promise.resolve();
    expect(editor.scene.shapes.get(parent.id)!.position).toEqual(before);

    editor.addElement(childOf("c3", parent.id, 999, 999));
    await Promise.resolve();
    expect(editor.scene.shapes.get(parent.id)!.position).toEqual(before);

    // Children landed inside the drop-zone (offset by padding).
    expect(editor.scene.shapes.get(elementId("c1"))!.position).toEqual({ x: 12, y: 12 });
    expect(editor.scene.shapes.get(elementId("c2"))!.position).toEqual({ x: 72, y: 12 });
    expect(editor.scene.shapes.get(elementId("c3"))!.position).toEqual({ x: 12, y: 72 });
  });

  // The live drop-zone synthesiser for auto-layout shapes is unit-tested in
  // packages/scene/tests/container.test.ts. The tests here pin the
  // editor-side flow (no shift on add / runLayout).

  // Simulate the library-drop sequence (beginPlacement → update over
  // container → commit) and assert that the dropped child snaps to the grid
  // slot in the microtask after commit.
  it("library drop into auto-grid snaps to the grid slot after commit (notify pairing)", async () => {
    const parent = {
      ...containerWithAutoLayout("grid"),
      // padding=12 mirrors layout.auto-grid template.
      metadata: {
        autoLayout: { kind: "grid", cols: 2, gap: 10 },
        container: { padding: 12 },
      },
      position: { x: 50, y: 60 },
      width: 400,
      height: 400,
    } as Element;
    const editor = makeEditor(sceneWith(parent));

    // First library drop. `beginPlacement` adds the shape; its
    // `parentId` is assigned on commit via
    // `computePlacementContainerDrop`, so the input must arrive
    // un-parented.
    const first = { ...childOf("c1", parent.id, 0, 0) };
    delete (first as { parentId?: ReturnType<typeof elementId> }).parentId;

    const placement1 = editor.beginPlacement(first);
    placement1.update({ x: 300, y: 250 });
    placement1.commit();
    await Promise.resolve();

    // c1 must have landed at the grid origin (parent.position +
    // padding), NOT at the cursor drop point.
    expect(editor.scene.shapes.get(first.id)!.position).toEqual({
      x: 50 + 12,
      y: 60 + 12,
    });
    // And it must be parented to the container.
    expect(editor.scene.shapes.get(first.id)!.parentId).toBe(parent.id);

    // Second drop at a different cursor position — must land at
    // (cellW+gap, 0) relative to drop zone, regardless of cursor.
    const second = { ...childOf("c2", parent.id, 0, 0) };
    delete (second as { parentId?: ReturnType<typeof elementId> }).parentId;
    const placement2 = editor.beginPlacement(second);
    placement2.update({ x: 350, y: 270 });
    placement2.commit();
    await Promise.resolve();

    // 50px width + 10px gap → second cell starts at x = parent.x +
    // padding + 60 = 50 + 12 + 60 = 122.
    expect(editor.scene.shapes.get(second.id)!.position).toEqual({
      x: 50 + 12 + 60,
      y: 60 + 12,
    });
    // No overlap with c1.
    expect(editor.scene.shapes.get(first.id)!.position).toEqual({
      x: 50 + 12,
      y: 60 + 12,
    });
  });
});

describe("arrange layouts", () => {
  it("arrangeAsGrid positions selection on a regular grid", () => {
    const shapes = [
      rect("a", 500, 500),
      rect("b", 0, 0),
      rect("c", 800, 800),
      rect("d", 100, 100),
    ];
    const editor = makeEditor(sceneWith(...shapes));
    editor.setSelection(new Set(shapes.map((s) => s.id)));
    editor.arrangeAsGrid({ cols: 2, gap: 4 });
    // 4 shapes → 2x2; cell = 20+4 = 24.
    const positions = shapes.map((s) => editor.scene.shapes.get(s.id)!.position);
    const xs = new Set(positions.map((p) => p.x));
    const ys = new Set(positions.map((p) => p.y));
    expect(xs.size).toBe(2);
    expect(ys.size).toBe(2);
  });

  it("arrangeAsStack lays out shapes horizontally with gap", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 1000, 1000);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    editor.arrangeAsStack({ direction: "horizontal", gap: 10 });
    const pa = editor.scene.shapes.get(a.id)!.position;
    const pb = editor.scene.shapes.get(b.id)!.position;
    expect(pb.y).toBe(pa.y);
    expect(pb.x - pa.x).toBe(20 + 10); // shape width + gap
  });

  it("arrange is a no-op for single selection", () => {
    const a = rect("a", 100, 100);
    const editor = makeEditor(sceneWith(a));
    editor.setSelection(new Set([a.id]));
    editor.arrangeAsGrid({ cols: 2 });
    expect(editor.scene.shapes.get(a.id)!.position).toEqual({ x: 100, y: 100 });
  });
});
