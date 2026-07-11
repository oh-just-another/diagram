/**
 * Behavioural coverage for `<LinkStylePanel>`: each control change routes
 * through `editor.updateSelectedLink` and mutates the selected edge in the
 * scene — routing, arrowheads, stroke color / width, dash pattern, line
 * kind and label. Also pins that the panel renders nothing without a
 * selected edge.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Element,
  type Link,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, LinkStylePanel } from "../src/index";

installBuiltinRenderers();

afterEach(cleanup);

const LINK_ID = linkId("L1");

const rect = (id: string, x: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc", stroke: "#000", strokeWidth: 2 },
  width: 50,
  height: 50,
});

const link: Link = {
  id: LINK_ID,
  layerId: DEFAULT_LAYER_ID,
  order: orderBetween(null, null),
  from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
  to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
  style: { stroke: "#000000", strokeWidth: 1.5 },
  routing: "straight",
};

const mountEditor = (): Editor => {
  let scene = emptyScene();
  ({ scene } = addElement(scene, rect("a", 0)));
  ({ scene } = addElement(scene, rect("b", 200)));
  ({ scene } = addLink(scene, link));
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
  const editor = new Editor({
    host: host as never,
    mainTarget: noop,
    overlayTarget: noop,
    initialScene: scene,
  });
  // Link selection lives in a dedicated slot; set it directly (the field is
  // public and this mirrors what a link click produces).
  editor._selectedLinks = new Set([LINK_ID]);
  return editor;
};

const renderPanel = (editor: Editor) =>
  render(
    <DiagramProvider editor={editor}>
      <LinkStylePanel />
    </DiagramProvider>,
  );

const selectByLabel = (container: HTMLElement, label: string): HTMLSelectElement => {
  const row = [...container.querySelectorAll("label")].find((l) =>
    l.textContent?.startsWith(label),
  );
  return row?.querySelector("select") as HTMLSelectElement;
};

describe("LinkStylePanel", () => {
  it("renders nothing when no edge is selected", () => {
    const editor = mountEditor();
    editor._selectedLinks = new Set();
    const { container } = renderPanel(editor);
    expect(container.querySelector("aside")).toBeNull();
    editor.dispose();
  });

  it("changing Routing writes the routing strategy to the edge", () => {
    const editor = mountEditor();
    const { container } = renderPanel(editor);
    act(() => {
      fireEvent.change(selectByLabel(container, "Routing"), { target: { value: "orthogonal" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.routing).toBe("orthogonal");
    editor.dispose();
  });

  it("changing End arrowhead sets arrowheads.to", () => {
    const editor = mountEditor();
    const { container } = renderPanel(editor);
    act(() => {
      fireEvent.change(selectByLabel(container, "End"), { target: { value: "triangle" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.arrowheads?.to).toBe("triangle");
    editor.dispose();
  });

  it("selecting 'none' for Start clears arrowheads.from", () => {
    const editor = mountEditor();
    editor.updateSelectedLink((e) => ({ ...e, arrowheads: { from: "arrow" } }));
    const { container } = renderPanel(editor);
    act(() => {
      fireEvent.change(selectByLabel(container, "Start"), { target: { value: "none" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.arrowheads?.from).toBeUndefined();
    editor.dispose();
  });

  it("changing Color writes the stroke", () => {
    const editor = mountEditor();
    const { container } = renderPanel(editor);
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    act(() => {
      fireEvent.change(colorInput, { target: { value: "#ff0000" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.style.stroke).toBe("#ff0000");
    editor.dispose();
  });

  it("changing Width writes strokeWidth", () => {
    const editor = mountEditor();
    const { container } = renderPanel(editor);
    const widthInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => {
      fireEvent.change(widthInput, { target: { value: "5" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.style.strokeWidth).toBe(5);
    editor.dispose();
  });

  it("selecting Dash 'dashed' writes the dash array, 'solid' strips it", () => {
    const editor = mountEditor();
    const { container } = renderPanel(editor);
    act(() => {
      fireEvent.change(selectByLabel(container, "Dash"), { target: { value: "dashed" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.style.dashArray).toEqual([6, 4]);
    act(() => {
      fireEvent.change(selectByLabel(container, "Dash"), { target: { value: "solid" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.style.dashArray).toBeUndefined();
    editor.dispose();
  });

  it("changing Kind toggles lineKind to block-arrow", () => {
    const editor = mountEditor();
    const { container } = renderPanel(editor);
    act(() => {
      fireEvent.change(selectByLabel(container, "Kind"), { target: { value: "block-arrow" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.lineKind).toBe("block-arrow");
    editor.dispose();
  });

  it("typing a Label sets it, clearing removes it", () => {
    const editor = mountEditor();
    const { container } = renderPanel(editor);
    const labelRow = [...container.querySelectorAll("label")].find((l) =>
      l.textContent?.startsWith("Label"),
    );
    const input = labelRow?.querySelector("input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "yes" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.label?.text).toBe("yes");
    act(() => {
      fireEvent.change(input, { target: { value: "" } });
    });
    expect(editor.scene.links.get(LINK_ID)?.label).toBeUndefined();
    editor.dispose();
  });
});
