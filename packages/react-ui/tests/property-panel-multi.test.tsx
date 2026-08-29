/**
 * Multi-selection and group toolbars (design items 7–8): the row is the
 * intersection of the members' multi control sets, plus the shared tail
 * (Arrange / Group / Ungroup, comment for single selections only).
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type TextStyle,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, PropertyPanel, TooltipProvider } from "../src/index";

installBuiltinRenderers();

const base = {
  layerId: DEFAULT_LAYER_ID,
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
};
const rect = (id: string, x = 0): Element =>
  ({
    ...base,
    id: elementId(id),
    type: "rectangle",
    position: { x, y: 0 },
    style: { fill: "#abc" },
    width: 60,
    height: 40,
  }) as unknown as Element;
const text: Element = {
  ...base,
  id: elementId("t1"),
  type: "text",
  position: { x: 200, y: 0 },
  style: { fill: "#222" },
  text: "hi",
  fontFamily: "system-ui",
  fontSize: 24,
} as unknown as Element;
const frame: Element = {
  ...base,
  id: elementId("f1"),
  type: "frame",
  position: { x: 300, y: 0 },
  style: {},
  width: 200,
  height: 200,
} as unknown as Element;

const mountEditor = (...elements: Element[]): Editor => {
  let scene = emptyScene();
  for (const s of elements) ({ scene } = addElement(scene, s));
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
  });
};

const renderPanel = (editor: Editor) =>
  render(
    <TooltipProvider>
      <DiagramProvider editor={editor}>
        <PropertyPanel />
      </DiagramProvider>
    </TooltipProvider>,
  );

const has = (c: HTMLElement, label: string): boolean =>
  c.querySelector(`[aria-label="${label}"]`) !== null;
const hasPrefix = (c: HTMLElement, prefix: string): boolean =>
  c.querySelector(`[aria-label^="${prefix}"]`) !== null;

describe("multi-selection toolbar = intersection of control sets", () => {
  it("two shapes keep the shape set (minus the hyperlink) and gain Arrange + Group", () => {
    const editor = mountEditor(rect("a"), rect("b", 100));
    editor.setSelection([elementId("a"), elementId("b")]);
    const { container } = renderPanel(editor);
    expect(has(container, "Border style, corners and color")).toBe(true);
    expect(hasPrefix(container, "Font family")).toBe(true);
    expect(has(container, "Arrange")).toBe(true);
    expect(has(container, "Group")).toBe(true);
    expect(has(container, "Ungroup")).toBe(false);
    expect(has(container, "Add comment")).toBe(false);
    expect(has(container, "Link")).toBe(false);
    expect(has(container, "Filter selection by type")).toBe(false);
  });

  it("a shape + a text share the text-carrier cluster only", () => {
    const editor = mountEditor(rect("a"), text);
    editor.setSelection([elementId("a"), text.id]);
    const { container } = renderPanel(editor);
    expect(hasPrefix(container, "Font family")).toBe(true);
    expect(has(container, "Text style")).toBe(true);
    expect(has(container, "Text color and opacity")).toBe(true);
    expect(has(container, "Border style, corners and color")).toBe(false);
    expect(has(container, "List")).toBe(false);
    expect(has(container, "Filter selection by type")).toBe(true);
  });

  it("a shape + a frame share nothing but the tail", () => {
    const editor = mountEditor(rect("a"), frame);
    editor.setSelection([elementId("a"), frame.id]);
    const { container } = renderPanel(editor);
    expect(hasPrefix(container, "Font family")).toBe(false);
    expect(has(container, "Border style, corners and color")).toBe(false);
    expect(has(container, "Fill color and opacity")).toBe(false);
    expect(has(container, "Filter selection by type")).toBe(true);
    expect(has(container, "Arrange")).toBe(true);
    expect(has(container, "Lock selection")).toBe(true);
  });

  it("a single element gets its full set, a comment button and no Arrange", () => {
    const editor = mountEditor(rect("a"));
    editor.setSelection([elementId("a")]);
    const { container } = renderPanel(editor);
    expect(has(container, "Link")).toBe(true);
    expect(has(container, "Add comment")).toBe(true);
    expect(has(container, "Arrange")).toBe(false);
    expect(has(container, "Group")).toBe(false);
  });

  it("a mixed text write reaches the text element and the shape label in one step", () => {
    const editor = mountEditor(rect("a"), text);
    editor.setSelection([elementId("a"), text.id]);
    const { container } = renderPanel(editor);
    fireEvent.click(container.querySelector('[aria-label="Text style"]')!);
    const bold = document.querySelector('[aria-label="Bold"]');
    expect(bold).not.toBeNull();
    fireEvent.click(bold!);
    const textStyle = (): TextStyle | undefined =>
      editor.scene.elements.get(text.id)?.style as TextStyle | undefined;
    expect(textStyle()?.fontWeight).toBe("bold");
    expect(editor.scene.elements.get(elementId("a"))?.label?.style?.fontWeight).toBe("bold");
    editor.undo();
    expect(textStyle()?.fontWeight).toBeUndefined();
    expect(editor.scene.elements.get(elementId("a"))?.label).toBeUndefined();
  });
});

describe("multi-selection screen-reader summary", () => {
  it("the toolbar is described by the count and the first three types", () => {
    const editor = mountEditor(rect("a"), rect("b", 100), text, frame);
    editor.setSelection([elementId("a"), elementId("b"), text.id, frame.id]);
    const { container } = renderPanel(editor);
    const toolbar = container.querySelector('[role="toolbar"]')!;
    expect(toolbar.getAttribute("aria-label")).toBe("Selection");
    const descId = toolbar.getAttribute("aria-describedby")!;
    expect(document.getElementById(descId)?.textContent).toBe("4 elements: rectangle, text, frame");
  });

  it("a single selection has no summary", () => {
    const editor = mountEditor(rect("a"));
    editor.setSelection([elementId("a")]);
    const { container } = renderPanel(editor);
    expect(
      container.querySelector('[role="toolbar"]')?.getAttribute("aria-describedby"),
    ).toBeNull();
  });
});

describe("group toolbar", () => {
  it("a selected group shows its children's shared controls, Ungroup (no Group), no comment", () => {
    const editor = mountEditor(rect("a"), rect("b", 100));
    editor.setSelection([elementId("a"), elementId("b")]);
    editor.groupSelected();
    expect(editor.selection.size).toBe(1);
    const { container } = renderPanel(editor);
    expect(has(container, "Border style, corners and color")).toBe(true);
    expect(has(container, "Ungroup")).toBe(true);
    expect(has(container, "Group")).toBe(false);
    expect(has(container, "Add comment")).toBe(false);
    expect(has(container, "Arrange")).toBe(true);
  });

  it("align / distribute are disabled while exactly one whole group is selected", async () => {
    const editor = mountEditor(rect("a"), rect("b", 100));
    editor.setSelection([elementId("a"), elementId("b")]);
    editor.groupSelected();
    const { container, findByRole } = renderPanel(editor);
    fireEvent.click(container.querySelector('[aria-label="Arrange"]')!);
    const left = await findByRole("button", { name: "Align left" });
    expect((left as HTMLButtonElement).disabled).toBe(true);
  });

  it("a group + another element shows both Group and Ungroup", () => {
    const editor = mountEditor(rect("a"), rect("b", 100), rect("c", 200));
    editor.setSelection([elementId("a"), elementId("b")]);
    editor.groupSelected();
    const groupId = [...editor.selection][0]!;
    editor.setSelection([groupId, elementId("c")]);
    const { container } = renderPanel(editor);
    expect(has(container, "Group")).toBe(true);
    expect(has(container, "Ungroup")).toBe(true);
  });

  it("editing inside a group hides Group / Ungroup", () => {
    const editor = mountEditor(rect("a"), rect("b", 100));
    editor.setSelection([elementId("a"), elementId("b")]);
    editor.groupSelected();
    const groupId = [...editor.selection][0]!;
    editor.enterGroup(groupId);
    editor.setSelection([elementId("a"), elementId("b")]);
    const { container } = renderPanel(editor);
    expect(has(container, "Arrange")).toBe(true);
    expect(has(container, "Group")).toBe(false);
    expect(has(container, "Ungroup")).toBe(false);
  });
});
