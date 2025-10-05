import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  removeElement,
  updateElement,
  type Element,
} from "@oh-just-another/scene";
import { diffScenes, isEmptyDiff } from "../src/index";

const rect = (id: string, x = 0, y = 0): Element => ({
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
    ({ scene: base } = addElement(base, rect("a", 0, 0)));
    ({ scene: base } = addElement(base, rect("b", 10, 10)));

    let next = base;
    next = addElement(next, rect("c", 20, 20)).scene;
    next = removeElement(next, elementId("a")).scene;
    next = updateElement(next, elementId("b"), (s) => ({ ...s, position: { x: 99, y: 99 } })).scene;

    const d = diffScenes(base, next);
    expect(d.elements.added).toEqual([elementId("c")]);
    expect(d.elements.removed).toEqual([elementId("a")]);
    expect(d.elements.modified).toEqual([elementId("b")]);
  });
});
