/**
 * Behavioural coverage for the search overlay (⌘F): the registered action
 * opens the bar, typing filters scene text, the counter reflects the match
 * count, and navigation selects + frames each match.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
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
import { DiagramProvider, SearchOverlay } from "../src/index";

installBuiltinRenderers();
afterEach(cleanup);

const textEl = (id: string, body: string, x: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  text: body,
  fontFamily: "sans-serif",
  fontSize: 16,
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
  scene = sceneAddElement(scene, textEl("t1", "Hello world", 0)).scene;
  scene = sceneAddElement(scene, textEl("t2", "Goodbye moon", 200)).scene;
  scene = sceneAddElement(scene, textEl("t3", "Hello again", 400)).scene;
  const editor = new Editor({
    host,
    mainTarget: layered.get("main"),
    overlayTarget: layered.get("overlay"),
    initialScene: scene,
    initialTool: "select",
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

const openSearch = (editor: Editor): void => {
  act(() => {
    defaultActionRegistry.dispatch("open-search", { editor });
  });
};

describe("SearchOverlay", () => {
  it("is hidden until the open-search action fires", () => {
    const ctx = mountEditor();
    const { queryByLabelText } = render(<SearchOverlay />, { wrapper: wrap(ctx.editor) });
    expect(queryByLabelText("Find text in diagram")).toBeNull();
    openSearch(ctx.editor);
    expect(queryByLabelText("Find text in diagram")).not.toBeNull();
    ctx.cleanup();
  });

  it("filters by substring, counts matches, and selects the first match", () => {
    const ctx = mountEditor();
    const { getByLabelText, getByText } = render(<SearchOverlay />, { wrapper: wrap(ctx.editor) });
    openSearch(ctx.editor);
    const input = getByLabelText("Find text in diagram");
    act(() => {
      fireEvent.change(input, { target: { value: "hello" } });
    });
    // Two shapes contain "hello" (t1, t3), first is selected + framed.
    expect(getByText("1 of 2")).toBeTruthy();
    expect([...ctx.editor.selection]).toEqual([elementId("t1")]);
    ctx.cleanup();
  });

  it("navigates to the next match with the down button (wrap-around)", () => {
    const ctx = mountEditor();
    const { getByLabelText } = render(<SearchOverlay />, { wrapper: wrap(ctx.editor) });
    openSearch(ctx.editor);
    act(() => {
      fireEvent.change(getByLabelText("Find text in diagram"), { target: { value: "hello" } });
    });
    act(() => {
      fireEvent.click(getByLabelText("Next match"));
    });
    expect([...ctx.editor.selection]).toEqual([elementId("t3")]);
    ctx.cleanup();
  });

  it("does not navigate on reopen before the user types (query reset on close)", () => {
    const ctx = mountEditor();
    const { getByLabelText } = render(<SearchOverlay />, { wrapper: wrap(ctx.editor) });
    // First search jumps to a match, then close.
    openSearch(ctx.editor);
    act(() => {
      fireEvent.change(getByLabelText("Find text in diagram"), { target: { value: "goodbye" } });
    });
    expect([...ctx.editor.selection]).toEqual([elementId("t2")]);
    act(() => {
      fireEvent.keyDown(getByLabelText("Find text in diagram"), { key: "Escape" });
    });
    // Clear the selection so a stray reopen-navigation would be observable.
    act(() => {
      ctx.editor.setSelection([]);
    });
    // Reopen — the input must be empty and NOTHING should be selected/framed
    // until the user types.
    openSearch(ctx.editor);
    const input = getByLabelText("Find text in diagram") as HTMLInputElement;
    expect(input.value).toBe("");
    expect([...ctx.editor.selection]).toEqual([]);
    ctx.cleanup();
  });

  it("shows a no-results state and closes on Escape", () => {
    const ctx = mountEditor();
    const { getByLabelText, getByText, queryByLabelText } = render(<SearchOverlay />, {
      wrapper: wrap(ctx.editor),
    });
    openSearch(ctx.editor);
    const input = getByLabelText("Find text in diagram");
    act(() => {
      fireEvent.change(input, { target: { value: "zzz" } });
    });
    expect(getByText("No results")).toBeTruthy();
    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    expect(queryByLabelText("Find text in diagram")).toBeNull();
    ctx.cleanup();
  });
});
