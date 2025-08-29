/**
 * Text selection shows a typography row + a single combined
 * "color & opacity" control (T4), not the separate Fill / Stroke
 * triggers of the generic shape panel.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
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

const text: Shape = {
  id: shapeId("t1"),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#222", opacity: 1 },
  text: "hi",
  fontFamily: "system-ui, sans-serif",
  fontSize: 24,
} as unknown as Shape;

const mountEditor = (): Editor => {
  let scene = emptyScene();
  ({ scene } = addShape(scene, text));
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
  return new Editor({ host: host as never, mainTarget: noop, overlayTarget: noop, initialScene: scene });
};

describe("PropertyPanel for text shapes", () => {
  it("shows the combined color & opacity control, not separate Fill/Stroke", () => {
    const editor = mountEditor();
    editor.setSelection([text.id]);
    const { container } = render(
      <TooltipProvider>
        <DiagramProvider editor={editor}>
          <PropertyPanel />
        </DiagramProvider>
      </TooltipProvider>,
    );
    expect(container.querySelector('button[aria-label="Text color and opacity"]')).not.toBeNull();
    // The generic separate Fill / Stroke triggers are gone for text.
    expect(container.querySelector('button[aria-label="Fill color"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Stroke color"]')).toBeNull();
    editor.dispose();
  });
});
