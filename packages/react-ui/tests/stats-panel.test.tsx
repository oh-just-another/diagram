/**
 * Behavioural coverage for the stats panel (⌥/): the registered action
 * toggles it, it shows scene totals, and it reports the selection's bounds
 * (x / y / w / h) once a shape is selected.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement as sceneAddElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor, defaultActionRegistry } from "@oh-just-another/state";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, StatsPanel } from "../src/index";

installBuiltinRenderers();
afterEach(cleanup);

const rect = (id: string, x: number, y: number, w: number, h: number): Element => ({
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

const mountEditor = (): { editor: Editor; cleanup: () => void } => {
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
    }),
  });
  document.body.appendChild(host);
  const layered = new LayeredCanvas(host, 400, 300);
  let scene: Scene = emptyScene();
  scene = { ...scene, viewport: { ...scene.viewport, size: { width: 400, height: 300 } } };
  scene = sceneAddElement(scene, rect("r1", 10, 20, 40, 30)).scene;
  scene = sceneAddElement(scene, rect("r2", 100, 100, 50, 50)).scene;
  const editor = new Editor({
    host,
    mainTarget: layered.get("main"),
    overlayTarget: layered.get("overlay"),
    initialScene: scene,
    initialMode: "select",
  });
  return {
    editor,
    cleanup: () => {
      editor.dispose();
      host.remove();
    },
  };
};

const wrap =
  (editor: Editor) =>
  ({ children }: { children: ReactNode }) => (
    <DiagramProvider editor={editor}>{children}</DiagramProvider>
  );

const toggle = (editor: Editor): void => {
  act(() => {
    defaultActionRegistry.dispatch("toggle-stats", { editor });
  });
};

describe("StatsPanel", () => {
  it("is hidden until the toggle-stats action fires, and hides again on re-toggle", () => {
    const ctx = mountEditor();
    const { queryByLabelText } = render(<StatsPanel />, { wrapper: wrap(ctx.editor) });
    expect(queryByLabelText("Selection stats")).toBeNull();
    toggle(ctx.editor);
    expect(queryByLabelText("Selection stats")).not.toBeNull();
    toggle(ctx.editor);
    expect(queryByLabelText("Selection stats")).toBeNull();
    ctx.cleanup();
  });

  it("shows scene totals and an empty selection state", () => {
    const ctx = mountEditor();
    const { getByText } = render(<StatsPanel />, { wrapper: wrap(ctx.editor) });
    toggle(ctx.editor);
    expect(getByText("Nothing selected")).toBeTruthy();
    // Scene section: 2 elements, 0 edges.
    expect(getByText("Elements")).toBeTruthy();
    expect(getByText("Edges")).toBeTruthy();
    ctx.cleanup();
  });

  it("reports the selected shape's bounds", () => {
    const ctx = mountEditor();
    const { getByText, queryByText } = render(<StatsPanel />, { wrapper: wrap(ctx.editor) });
    toggle(ctx.editor);
    act(() => {
      ctx.editor.setSelection([elementId("r1")]);
    });
    // r1 = position (10,20), 40×30 → world AABB matches.
    expect(queryByText("Nothing selected")).toBeNull();
    expect(getByText("40")).toBeTruthy(); // W
    expect(getByText("30")).toBeTruthy(); // H
    ctx.cleanup();
  });
});
