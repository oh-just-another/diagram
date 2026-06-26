import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { defaultActionRegistry } from "../src/actions/index.js";
import { Editor } from "../src/editor.js";

// Exercises every built-in action handler through `defaultActionRegistry`:
// `dispatch` runs the action's `predicate` (the gate) and, when it passes, its
// `perform`. Both are the arrow functions that show up uncovered in the report,
// and `perform` delegates into the real editor command, so each case doubles as
// a smoke test of the underlying editing operation.

const rect = (id: string, x = 0, y = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

const text = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  text: "AB",
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;
const makeHost = () =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { cursor: "" },
  }) as never;

const editorWith = (scene: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

const run = (editor: Editor, id: string): boolean => defaultActionRegistry.dispatch(id, { editor });

const threeSelected = (): Editor => {
  const e = editorWith(sceneWith(rect("a", 0, 0), rect("b", 100, 10), rect("c", 200, 20)));
  e.setSelection([elementId("a"), elementId("b"), elementId("c")]);
  return e;
};

describe("arrange action handlers", () => {
  it("flip runs with any selection", () => {
    const e = threeSelected();
    expect(run(e, "flip-horizontal")).toBe(true);
    expect(run(e, "flip-vertical")).toBe(true);
  });

  it("align is gated on a multi-selection (≥2)", () => {
    const one = editorWith(sceneWith(rect("a")));
    one.setSelection([elementId("a")]);
    expect(run(one, "align-left")).toBe(false);

    const e = threeSelected();
    for (const id of [
      "align-left",
      "align-h-center",
      "align-right",
      "align-top",
      "align-v-center",
      "align-bottom",
    ]) {
      expect(run(e, id)).toBe(true);
    }
  });

  it("distribute needs three (false at 2, true at 3)", () => {
    const two = editorWith(sceneWith(rect("a", 0, 0), rect("b", 100, 0)));
    two.setSelection([elementId("a"), elementId("b")]);
    expect(run(two, "distribute-horizontal")).toBe(false);

    const e = threeSelected();
    expect(run(e, "distribute-horizontal")).toBe(true);
    expect(run(e, "distribute-vertical")).toBe(true);
  });
});

describe("clipboard action handlers", () => {
  it("copy / cut / paste run against the internal buffer", () => {
    const e = editorWith(sceneWith(rect("a"), rect("b")));
    e.setSelection([elementId("a")]);
    expect(run(e, "copy")).toBe(true);
    expect(run(e, "paste")).toBe(true);
    e.setSelection([elementId("b")]);
    expect(run(e, "cut")).toBe(true);
  });

  it("paste-style is gated on a primed style clipboard", () => {
    const e = editorWith(sceneWith(rect("a"), rect("b")));
    e.setSelection([elementId("a")]);
    expect(run(e, "paste-style")).toBe(false); // nothing copied yet
    expect(run(e, "copy-style")).toBe(true);
    e.setSelection([elementId("b")]);
    expect(run(e, "paste-style")).toBe(true);
  });
});

describe("view + zoom action handlers", () => {
  it("toggle-grid flips the flag and reports checked state", () => {
    const e = editorWith(sceneWith(rect("a")));
    const before = e.gridEnabled;
    expect(run(e, "toggle-grid")).toBe(true);
    expect(e.gridEnabled).toBe(!before);
    expect(defaultActionRegistry.get("toggle-grid")?.checked?.({ editor: e })).toBe(e.gridEnabled);
  });

  it("zoom commands run; zoom-to-selection needs a selection", () => {
    const empty = editorWith(sceneWith(rect("a")));
    expect(run(empty, "zoom-to-selection")).toBe(false);

    const e = editorWith(sceneWith(rect("a")));
    e.setSelection([elementId("a")]);
    for (const id of ["zoom-in", "zoom-out", "zoom-reset", "zoom-to-fit", "zoom-to-selection"]) {
      expect(run(e, id)).toBe(true);
    }
  });
});

describe("text action handlers", () => {
  it("font-size steps need a text element in the selection", () => {
    const noText = editorWith(sceneWith(rect("a")));
    noText.setSelection([elementId("a")]);
    expect(run(noText, "increase-font-size")).toBe(false);

    const e = editorWith(sceneWith(text("t")));
    e.setSelection([elementId("t")]);
    expect(run(e, "increase-font-size")).toBe(true);
    expect(run(e, "decrease-font-size")).toBe(true);
  });
});

describe("layout action handlers", () => {
  it("grid / stack need a multi-selection", () => {
    const one = editorWith(sceneWith(rect("a")));
    one.setSelection([elementId("a")]);
    expect(run(one, "arrange-stack-h")).toBe(false);
    expect(run(one, "auto-arrange")).toBe(false); // plain rect carries no layout spec

    const e = threeSelected();
    expect(run(e, "arrange-grid")).toBe(true);
    expect(run(e, "arrange-stack-h")).toBe(true);
    expect(run(e, "arrange-stack-v")).toBe(true);
    expect(run(e, "compact-z-order")).toBe(true);
  });
});
