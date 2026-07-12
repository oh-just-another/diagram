/**
 * Inline link-caption editor: multiline textarea semantics — Enter commits,
 * Shift+Enter inserts a newline (stays open), Escape cancels.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { linkId, type LinkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addLink,
  emptyScene,
  orderBetween,
  type Link,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, LinkCaptionEditor } from "../src/index";

const link = (): Link => ({
  id: linkId("L"),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "point", position: { x: 0, y: 0 } },
  to: { kind: "point", position: { x: 200, y: 0 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
});

const mountEditor = (): { editor: Editor; cleanup: () => void } => {
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
    }),
  });
  document.body.appendChild(host);
  const layered = new LayeredCanvas(host, 200, 100);
  let scene = emptyScene();
  scene = { ...scene, viewport: { ...scene.viewport, size: { width: 200, height: 100 } } };
  scene = addLink(scene, link()).scene;
  const editor = new Editor({
    host,
    mainTarget: layered.get("main"),
    overlayTarget: layered.get("overlay"),
    initialScene: scene,
  });
  return {
    editor,
    cleanup: () => {
      editor.dispose();
      host.remove();
    },
  };
};

const wrap = (editor: Editor) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DiagramProvider editor={editor}>{children}</DiagramProvider>
  );
  return Wrapper;
};

const id: LinkId = linkId("L");

describe("LinkCaptionEditor", () => {
  let ctx: ReturnType<typeof mountEditor>;
  beforeEach(() => {
    ctx = mountEditor();
  });
  afterEach(() => {
    cleanup();
    ctx.cleanup();
  });

  const openEditor = () => {
    act(() => {
      ctx.editor.beginLinkCaptionEdit(id);
    });
    return screen.getByPlaceholderText("Label");
  };

  it("renders a textarea while a caption edit is active", () => {
    render(<LinkCaptionEditor />, { wrapper: wrap(ctx.editor) });
    const field = openEditor();
    expect(field.tagName).toBe("TEXTAREA");
  });

  it("Enter commits the typed text as the label", () => {
    render(<LinkCaptionEditor />, { wrapper: wrap(ctx.editor) });
    const field = openEditor();
    fireEvent.change(field, { target: { value: "hello" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(ctx.editor.editingLinkCaption).toBeNull();
    expect(ctx.editor.scene.links.get(id)?.label?.text).toBe("hello");
  });

  it("Shift+Enter does NOT commit (newline stays in the field)", () => {
    render(<LinkCaptionEditor />, { wrapper: wrap(ctx.editor) });
    const field = openEditor();
    fireEvent.change(field, { target: { value: "line one" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(ctx.editor.editingLinkCaption).toBe(id);
    fireEvent.change(field, { target: { value: "line one\nline two" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(ctx.editor.scene.links.get(id)?.label?.text).toBe("line one\nline two");
  });

  it("Escape cancels without touching the label", () => {
    render(<LinkCaptionEditor />, { wrapper: wrap(ctx.editor) });
    const field = openEditor();
    fireEvent.change(field, { target: { value: "discarded" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(ctx.editor.editingLinkCaption).toBeNull();
    expect(ctx.editor.scene.links.get(id)?.label).toBeUndefined();
  });
});
