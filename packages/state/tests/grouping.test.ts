import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  addShape,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Patch,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const rect = (id: string, x: number, y: number, w = 20, h = 20): Shape => ({
  id: shapeId(id),
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

const sceneWith = (...shapes: Shape[]): Scene => {
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

  it("undo restores pre-group state", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const editor = makeEditor(sceneWith(a, b));
    editor.setSelection(new Set([a.id, b.id]));
    editor.groupSelected();
    editor.undo();
    expect(editor.scene.shapes.get(a.id)?.parentId).toBeUndefined();
    expect(editor.scene.shapes.get(b.id)?.parentId).toBeUndefined();
    const groupShapes = [...editor.scene.shapes.values()].filter((s) => s.type === "group");
    expect(groupShapes.length).toBe(0);
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
