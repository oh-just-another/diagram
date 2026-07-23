/**
 * Persistent link badges: one chip per element with a SAFE `href`, none for
 * unsafe schemes or plain shapes; clicking opens the link via the editor.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, LinkBadges } from "../src/index";

const rect = (id: string, href?: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 10, y: 10 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 40,
  ...(href !== undefined ? { href } : {}),
});

const mountEditor = (...els: Element[]): { editor: Editor; teardown: () => void } => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const layered = new LayeredCanvas(host, 200, 100);
  let scene = emptyScene();
  for (const el of els) scene = addElement(scene, el).scene;
  const editor = new Editor({
    host,
    mainTarget: layered.get("main"),
    overlayTarget: layered.get("overlay"),
    initialScene: scene,
  });
  return {
    editor,
    teardown: () => {
      editor.dispose();
      host.remove();
    },
  };
};

const ui = (editor: Editor): ReactNode => (
  <DiagramProvider editor={editor}>
    <LinkBadges />
  </DiagramProvider>
);

afterEach(cleanup);

describe("LinkBadges", () => {
  it("renders a badge only for elements with a safe href", () => {
    const { editor, teardown } = mountEditor(
      rect("a", "https://example.com"),
      rect("b"),
      rect("c", "javascript:alert(1)"),
    );
    render(ui(editor));
    const badges = screen.getAllByRole("button");
    expect(badges).toHaveLength(1);
    expect(badges[0]?.title).toBe("https://example.com");
    teardown();
  });

  it("renders nothing when no element carries a link", () => {
    const { editor, teardown } = mountEditor(rect("a"), rect("b"));
    const { container } = render(ui(editor));
    expect(container.querySelector(".du-link-badge")).toBeNull();
    expect(document.querySelector(".du-link-badge")).toBeNull();
    teardown();
  });

  it("clicking the badge opens the link through the editor", () => {
    const { editor, teardown } = mountEditor(rect("a", "https://example.com"));
    const openLink = vi.spyOn(editor, "openLink").mockImplementation(() => undefined);
    render(ui(editor));
    fireEvent.click(screen.getByRole("button"));
    expect(openLink).toHaveBeenCalledWith("https://example.com");
    teardown();
  });
});
