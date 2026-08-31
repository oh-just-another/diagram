/**
 * The "Shapes and lines" flyout marks the armed tool: the row whose shape
 * kind / line preset is currently active carries `is-active` +
 * `aria-checked`, and only that row.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyScene } from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, Toolbar, DEFAULT_VERTICAL_TOOLBAR } from "../src/index";

installBuiltinRenderers();
afterEach(cleanup);

const mountEditor = (): { editor: Editor; cleanup: () => void } => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const layered = new LayeredCanvas(host, 200, 100);
  const editor = new Editor({
    host,
    mainTarget: layered.get("main"),
    overlayTarget: layered.get("overlay"),
    initialScene: emptyScene(),
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

const btnByLabel = (root: HTMLElement, label: string): HTMLButtonElement | undefined =>
  [...root.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label) as
    | HTMLButtonElement
    | undefined;

const checkedRows = (root: HTMLElement): string[] =>
  [...root.querySelectorAll('[role="menuitemradio"][aria-checked="true"]')].map(
    (b) => b.getAttribute("aria-label") ?? "",
  );

describe("Shapes and lines flyout — active row", () => {
  it("marks the armed shape row and the armed line row", () => {
    const { editor, cleanup: dispose } = mountEditor();
    try {
      const { container } = render(
        <Toolbar items={DEFAULT_VERTICAL_TOOLBAR} orientation="vertical" />,
        {
          wrapper: wrap(editor),
        },
      );
      act(() => {
        editor.armShapeTool("diamond");
      });
      act(() => {
        btnByLabel(container, "Shapes and lines")?.click();
      });
      expect(checkedRows(document.body)).toEqual(["Rhombus"]);
      expect(btnByLabel(document.body, "Rhombus")?.classList.contains("is-active")).toBe(true);

      act(() => {
        btnByLabel(document.body, "Arrow")?.click();
      });
      expect(editor.linkDrawPreset).toBe("arrow");
      act(() => {
        btnByLabel(container, "Shapes and lines")?.click();
      });
      expect(checkedRows(document.body)).toEqual(["Arrow"]);
    } finally {
      dispose();
    }
  });

  it("stock draw-edge (hotkey L) reads as the Elbow arrow row; select marks nothing", () => {
    const { editor, cleanup: dispose } = mountEditor();
    try {
      const { container } = render(
        <Toolbar items={DEFAULT_VERTICAL_TOOLBAR} orientation="vertical" />,
        {
          wrapper: wrap(editor),
        },
      );
      act(() => {
        editor.setActiveTool("draw-edge");
      });
      act(() => {
        btnByLabel(container, "Shapes and lines")?.click();
      });
      expect(checkedRows(document.body)).toEqual(["Elbow arrow"]);
      act(() => {
        editor.setActiveTool("select");
      });
      expect(checkedRows(document.body)).toEqual([]);
    } finally {
      dispose();
    }
  });
});

describe("flyout placement", () => {
  it("opens position: fixed so the scrollable dock cannot clip it", () => {
    const { editor, cleanup: dispose } = mountEditor();
    const { container } = render(
      <DiagramProvider editor={editor}>
        <Toolbar items={DEFAULT_VERTICAL_TOOLBAR} orientation="vertical" />
      </DiagramProvider>,
    );
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Shapes and lines"]')!.click();
    });
    const menu = document.querySelector<HTMLElement>('[role=menu][aria-label="Shapes and lines"]')!;
    expect(menu).not.toBeNull();
    // The layout effect has run: the menu is placed (fixed), not left in
    // its hidden pre-measure state.
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.visibility).not.toBe("hidden");
    dispose();
  });
});
