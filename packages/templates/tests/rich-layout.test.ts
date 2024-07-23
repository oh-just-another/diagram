import { describe, expect, it } from "vitest";
import {
  layoutTree,
  type AlignItems,
  type JustifyContent,
  type MeasureText,
  type TemplateNode,
} from "../src/rich/index";

const measure: MeasureText = (text, _f, size) => text.length * size * 0.5;

const findById = (
  node: ReturnType<typeof layoutTree>,
  id: string,
): ReturnType<typeof layoutTree> | null => {
  if (node.node.id === id) return node;
  for (const c of node.children) {
    const found = findById(c, id);
    if (found) return found;
  }
  return null;
};

describe("layoutTree — leaf intrinsic sizes", () => {
  it("text width = chars × fontSize × 0.5 (mocked measure)", () => {
    const root: TemplateNode = { type: "text", id: "t", text: "abcd", style: { fontSize: 10 } };
    const l = layoutTree(root, { measureText: measure });
    expect(l.bounds.width).toBe(4 * 10 * 0.5);
    expect(l.bounds.height).toBeCloseTo(10 * 1.2, 5);
  });

  it("icon/image default to 24x24", () => {
    const icon = layoutTree({ type: "icon", svg: "" }, { measureText: measure });
    expect(icon.bounds).toEqual({ x: 0, y: 0, width: 24, height: 24 });
    const image = layoutTree({ type: "image", src: "" }, { measureText: measure });
    expect(image.bounds.width).toBe(24);
  });

  it("explicit width/height override intrinsic", () => {
    const l = layoutTree(
      { type: "container", layout: { width: 200, height: 80 } },
      { measureText: measure },
    );
    expect(l.bounds).toEqual({ x: 0, y: 0, width: 200, height: 80 });
  });
});

describe("layoutTree — container flex row", () => {
  const root: TemplateNode = {
    type: "container",
    id: "root",
    layout: { flexDirection: "row", padding: 5, gap: 4, width: 200, height: 50 },
    children: [
      { type: "container", id: "a", layout: { width: 30, height: 30 } },
      { type: "container", id: "b", layout: { width: 50, height: 40 } },
      { type: "container", id: "c", layout: { width: 20, height: 20 } },
    ],
  };

  it("places children left-to-right with gap and padding", () => {
    const l = layoutTree(root, { measureText: measure });
    const a = findById(l, "a")!.bounds;
    const b = findById(l, "b")!.bounds;
    const c = findById(l, "c")!.bounds;
    expect(a.x).toBe(5); // padding-left
    expect(b.x).toBe(5 + 30 + 4); // + a.width + gap
    expect(c.x).toBe(5 + 30 + 4 + 50 + 4);
  });

  it("alignItems = stretch fills cross axis", () => {
    const l = layoutTree(root, { measureText: measure });
    // padding-top = 5, height = 50, so stretch height = 50 - 5 - 5 = 40.
    const a = findById(l, "a")!.bounds;
    expect(a.height).toBe(40);
  });
});

describe("layoutTree — justifyContent", () => {
  const make = (justify: JustifyContent): TemplateNode => ({
    type: "container",
    id: "root",
    layout: {
      flexDirection: "row",
      justifyContent: justify,
      width: 100,
      height: 20,
    },
    children: [
      { type: "container", id: "a", layout: { width: 20, height: 20 } },
      { type: "container", id: "b", layout: { width: 20, height: 20 } },
    ],
  });

  it("start: children at the beginning", () => {
    const l = layoutTree(make("start"), { measureText: measure });
    expect(findById(l, "a")!.bounds.x).toBe(0);
    expect(findById(l, "b")!.bounds.x).toBe(20);
  });

  it("center: children centered", () => {
    const l = layoutTree(make("center"), { measureText: measure });
    // free space = 100 - 40 = 60; offset 30 → a.x = 30, b.x = 50
    expect(findById(l, "a")!.bounds.x).toBe(30);
    expect(findById(l, "b")!.bounds.x).toBe(50);
  });

  it("end: children at the right", () => {
    const l = layoutTree(make("end"), { measureText: measure });
    expect(findById(l, "a")!.bounds.x).toBe(60);
    expect(findById(l, "b")!.bounds.x).toBe(80);
  });

  it("space-between: extra space goes between siblings", () => {
    const l = layoutTree(make("space-between"), { measureText: measure });
    expect(findById(l, "a")!.bounds.x).toBe(0);
    expect(findById(l, "b")!.bounds.x).toBe(80);
  });
});

describe("layoutTree — flex grow", () => {
  it("flex children share leftover space proportionally", () => {
    const root: TemplateNode = {
      type: "container",
      id: "root",
      layout: { flexDirection: "row", width: 200, height: 20 },
      children: [
        { type: "container", id: "fixed", layout: { width: 50, height: 20 } },
        { type: "container", id: "grow", layout: { flex: 1, height: 20 } },
      ],
    };
    const l = layoutTree(root, { measureText: measure });
    const grow = findById(l, "grow")!.bounds;
    expect(grow.x).toBe(50);
    expect(grow.width).toBe(150);
  });
});

describe("layoutTree — alignItems", () => {
  const make = (align: AlignItems): TemplateNode => ({
    type: "container",
    id: "root",
    layout: { flexDirection: "row", alignItems: align, width: 100, height: 40 },
    children: [{ type: "container", id: "child", layout: { width: 20, height: 10 } }],
  });

  it("start", () => {
    const l = layoutTree(make("start"), { measureText: measure });
    expect(findById(l, "child")!.bounds.y).toBe(0);
  });
  it("center", () => {
    const l = layoutTree(make("center"), { measureText: measure });
    expect(findById(l, "child")!.bounds.y).toBe(15);
  });
  it("end", () => {
    const l = layoutTree(make("end"), { measureText: measure });
    expect(findById(l, "child")!.bounds.y).toBe(30);
  });
  it("stretch", () => {
    const l = layoutTree(make("stretch"), { measureText: measure });
    expect(findById(l, "child")!.bounds.height).toBe(40);
  });
});

describe("layoutTree — column direction", () => {
  it("places children top-to-bottom", () => {
    const root: TemplateNode = {
      type: "container",
      id: "root",
      layout: { flexDirection: "column", width: 50, height: 100, gap: 4 },
      children: [
        { type: "container", id: "a", layout: { height: 20 } },
        { type: "container", id: "b", layout: { height: 30 } },
      ],
    };
    const l = layoutTree(root, { measureText: measure });
    expect(findById(l, "a")!.bounds.y).toBe(0);
    expect(findById(l, "b")!.bounds.y).toBe(20 + 4);
  });
});

describe("layoutTree — flex-wrap", () => {
  const make = (): TemplateNode => ({
    type: "container",
    id: "root",
    layout: {
      flexDirection: "row",
      flexWrap: "wrap",
      width: 100,
      height: 100,
      gap: 4,
    },
    children: [
      { type: "container", id: "a", layout: { width: 40, height: 20 } },
      { type: "container", id: "b", layout: { width: 40, height: 20 } },
      { type: "container", id: "c", layout: { width: 40, height: 30 } },
    ],
  });

  it("wraps the third child onto a new line when the row overflows", () => {
    const l = layoutTree(make(), { measureText: measure });
    const a = findById(l, "a")!.bounds;
    const b = findById(l, "b")!.bounds;
    const c = findById(l, "c")!.bounds;
    // Row 1: a + gap + b = 84  → fits (≤ 100). c overflows → new line.
    expect(a.y).toBe(0);
    expect(b.y).toBe(0);
    expect(c.y).toBeGreaterThan(0);
  });

  it("the wrapped line starts after max-child-height + gap", () => {
    const l = layoutTree(make(), { measureText: measure });
    const c = findById(l, "c")!.bounds;
    expect(c.y).toBe(24);
  });
});

describe("layoutTree — baseline alignment", () => {
  it("aligns text baselines across siblings with different font sizes", () => {
    const tree: TemplateNode = {
      type: "container",
      id: "root",
      layout: { flexDirection: "row", alignItems: "baseline", width: 200, height: 60 },
      children: [
        { type: "text", id: "big", text: "BIG", style: { fontSize: 24 } },
        { type: "text", id: "small", text: "small", style: { fontSize: 12 } },
      ],
    };
    const l = layoutTree(tree, { measureText: measure });
    const big = findById(l, "big")!.bounds;
    const small = findById(l, "small")!.bounds;
    expect(big.y + 24 * 0.8).toBeCloseTo(small.y + 12 * 0.8, 5);
  });
});

describe("layoutTree — absolute positioning", () => {
  it("top/left position relative to padding box", () => {
    const root: TemplateNode = {
      type: "container",
      id: "root",
      layout: { padding: 10, width: 200, height: 100 },
      children: [
        {
          type: "container",
          id: "abs",
          layout: { position: "absolute", top: 5, left: 20, width: 30, height: 20 },
        },
      ],
    };
    const l = layoutTree(root, { measureText: measure });
    const abs = findById(l, "abs")!.bounds;
    expect(abs).toEqual({ x: 30, y: 15, width: 30, height: 20 });
  });

  it("right/bottom snap to opposite edge", () => {
    const root: TemplateNode = {
      type: "container",
      id: "root",
      layout: { width: 100, height: 50 },
      children: [
        {
          type: "container",
          id: "abs",
          layout: { position: "absolute", right: 10, bottom: 5, width: 20, height: 15 },
        },
      ],
    };
    const l = layoutTree(root, { measureText: measure });
    const abs = findById(l, "abs")!.bounds;
    expect(abs.x).toBe(100 - 10 - 20);
    expect(abs.y).toBe(50 - 5 - 15);
  });
});
