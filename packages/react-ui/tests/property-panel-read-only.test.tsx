/**
 * Read-only / view mode gating for the selection panels. When the editor is
 * read-only the property panel (and the floating shell that wraps it) must
 * render nothing — every control mutates the selection, so a viewer gets no
 * edit affordance at all. Navigation stays elsewhere (toolbar zoom, etc.).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import {
  DiagramProvider,
  PropertyPanel,
  SelectionFloatingPanel,
  TooltipProvider,
} from "../src/index";

installBuiltinRenderers();

afterEach(cleanup);

const rect: Element = {
  id: elementId("r1"),
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

const mountEditor = (readOnly: boolean): Editor => {
  let scene = emptyScene();
  ({ scene } = addElement(scene, rect));
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    }),
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
    readOnly,
  });
};

const renderPanel = (editor: Editor, node: React.ReactNode) =>
  render(
    <TooltipProvider>
      <DiagramProvider editor={editor}>{node}</DiagramProvider>
    </TooltipProvider>,
  );

describe("PropertyPanel in read-only", () => {
  it("renders no mutating controls when read-only", () => {
    const editor = mountEditor(true);
    editor.setSelection([rect.id]);
    const { container } = renderPanel(editor, <PropertyPanel />);
    // No buttons at all — the entire panel is suppressed.
    expect(container.querySelectorAll("button").length).toBe(0);
    editor.dispose();
  });

  it("renders controls again once read-only is lifted", () => {
    const editor = mountEditor(false);
    editor.setSelection([rect.id]);
    const { container } = renderPanel(editor, <PropertyPanel />);
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
    editor.dispose();
  });
});

describe("SelectionFloatingPanel in read-only", () => {
  it("renders nothing (no toolbar shell) when read-only", () => {
    const editor = mountEditor(true);
    editor.setSelection([rect.id]);
    renderPanel(editor, <SelectionFloatingPanel />);
    // The panel portals to a role="toolbar" shell — absent in read-only.
    expect(document.querySelector('[role="toolbar"]')).toBeNull();
    editor.dispose();
  });
});
