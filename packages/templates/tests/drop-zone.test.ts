import { describe, expect, it } from "vitest";
import {
  extractDropZone,
  fallbackMeasureText,
  layoutTree,
  type TemplateNode,
} from "../src/rich/index";

const swimlaneRoot: TemplateNode = {
  type: "container",
  id: "lane",
  style: { fill: "#ffffff", stroke: "#2f7a2f", strokeWidth: 2 },
  layout: { flexDirection: "column", padding: 0 },
  children: [
    {
      type: "container",
      id: "header",
      style: { fill: "#e6ffe6", stroke: "#2f7a2f", strokeWidth: 1 },
      layout: { padding: 8, height: 32, alignItems: "center" },
      children: [
        {
          type: "text",
          id: "title",
          text: "Swim-lane",
          style: { color: "#1c4a1c", fontSize: 13, fontWeight: "bold" },
        },
      ],
    },
    {
      type: "drop-zone",
      id: "lane-body",
      label: "Drop an element here",
      style: { stroke: "#9ccc9c", color: "#779977", fontSize: 12 },
      layout: { flex: 1, margin: 8 },
    },
  ],
};

const layoutAt = (width: number, height: number) => {
  const sized: TemplateNode = {
    ...swimlaneRoot,
    layout: { ...(swimlaneRoot.layout ?? {}), width, height },
  };
  return layoutTree(sized, {
    available: { width, height },
    measureText: fallbackMeasureText,
  });
};

describe("drop-zone extraction", () => {
  it("returns the flex-expanded lane-body bounds, not the intrinsic 80×60", () => {
    const dz = extractDropZone(layoutAt(360, 200));
    expect(dz).not.toBeNull();
    // header height 32, margin 8 each side, root padding 0
    // → body fills (360 - 16) × (200 - 32 - 16) = 344 × 152
    expect(dz!.width).toBe(344);
    expect(dz!.height).toBe(152);
    expect(dz!.x).toBe(8);
    expect(dz!.y).toBe(40);
  });

  it("scales with the template's available size", () => {
    const dz = extractDropZone(layoutAt(600, 400));
    expect(dz).not.toBeNull();
    expect(dz!.width).toBe(584);
    expect(dz!.height).toBe(352);
  });
});
