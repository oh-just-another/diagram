/**
 * Click-through pin-test for the stroke-style segmented control
 * inside the floating selection panel. Catches regressions where
 * the button visually exists but the click doesn't propagate to
 * `editor.updateStyle` (e.g. portal / tooltip / popover interception).
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { shapeId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Shape,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, PropertyPanel, TooltipProvider } from "../src/index";

installBuiltinRenderers();

const rect: Shape = {
  id: shapeId("r1"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc", stroke: "#000", strokeWidth: 2 },
  width: 50,
  height: 50,
};

const mountEditor = (): Editor => {
  let scene = emptyScene();
  ({ scene } = addShape(scene, rect));
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }),
  });
  const noop = new Proxy({} as Record<string, unknown>, {
    get: (_, key) =>
      key === "size"
        ? { width: 800, height: 600 }
        : key === "measureText"
          ? () => ({ width: 0 })
          : () => {},
  }) as never;
  return new Editor({
    host: host as never,
    mainTarget: noop,
    overlayTarget: noop,
    initialScene: scene,
  });
};

describe("PropertyPanel stroke-style click", () => {
  it("clicking the 'Dashed' button writes dashArray to the selected shape", () => {
    const editor = mountEditor();
    editor.setSelection([rect.id]);

    const { container } = render(
      <TooltipProvider>
        <DiagramProvider editor={editor}>
          <PropertyPanel />
        </DiagramProvider>
      </TooltipProvider>,
    );

    // Find the button by accessible name (label).
    const dashedBtn = container.querySelector('button[aria-label="Dashed"]');
    if (!dashedBtn) {
      // eslint-disable-next-line no-console
      console.log("DOM at failure:", container.innerHTML.slice(0, 2000));
    }
    expect(dashedBtn).not.toBeNull();

    act(() => {
      fireEvent.click(dashedBtn!);
    });

    const updated = editor.scene.shapes.get(rect.id);
    expect(updated?.style?.dashArray).toEqual([8, 4]);

    editor.dispose();
  });

  it("clicking 'Dotted' writes [2, 4]", () => {
    const editor = mountEditor();
    editor.setSelection([rect.id]);
    const { container } = render(
      <TooltipProvider>
        <DiagramProvider editor={editor}>
          <PropertyPanel />
        </DiagramProvider>
      </TooltipProvider>,
    );
    const btn = container.querySelector('button[aria-label="Dotted"]');
    expect(btn).not.toBeNull();
    act(() => {
      fireEvent.click(btn!);
    });
    expect(editor.scene.shapes.get(rect.id)?.style?.dashArray).toEqual([2, 4]);
    editor.dispose();
  });

  it("clicking 'Solid' resets dashArray to []", () => {
    const editor = mountEditor();
    editor.setSelection([rect.id]);
    // Pre-set to dashed so we know the reset works.
    editor.updateStyle([rect.id], { dashArray: [8, 4] });
    const { container } = render(
      <TooltipProvider>
        <DiagramProvider editor={editor}>
          <PropertyPanel />
        </DiagramProvider>
      </TooltipProvider>,
    );
    const btn = container.querySelector('button[aria-label="Solid"]');
    expect(btn).not.toBeNull();
    act(() => {
      fireEvent.click(btn!);
    });
    expect(editor.scene.shapes.get(rect.id)?.style?.dashArray).toEqual([]);
    editor.dispose();
  });
});
