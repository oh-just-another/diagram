import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  removeShape,
  updateShape,
  type Shape,
} from "@oh-just-another/scene";
import { diffScenes, isEmptyDiff } from "../src/index";

const rect = (id: string, x = 0, y = 0): Shape => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 10,
  height: 10,
});

describe("diffScenes", () => {
  it("returns empty diff when same scene compared to itself", () => {
    const a = emptyScene();
    const d = diffScenes(a, a);
    expect(isEmptyDiff(d)).toBe(true);
  });

  it("detects added / removed / modified shapes", () => {
    let base = emptyScene();
    ({ scene: base } = addShape(base, rect("a", 0, 0)));
    ({ scene: base } = addShape(base, rect("b", 10, 10)));

    let next = base;
    next = addShape(next, rect("c", 20, 20)).scene;
    next = removeShape(next, elementId("a")).scene;
    next = updateShape(next, elementId("b"), (s) => ({ ...s, position: { x: 99, y: 99 } })).scene;

    const d = diffScenes(base, next);
    expect(d.shapes.added).toEqual([elementId("c")]);
    expect(d.shapes.removed).toEqual([elementId("a")]);
    expect(d.shapes.modified).toEqual([elementId("b")]);
  });
});
