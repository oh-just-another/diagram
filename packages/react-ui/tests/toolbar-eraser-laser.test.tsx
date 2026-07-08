/**
 * The eraser and laser-pointer tools show up in the default toolbar and their
 * hotkeys (E / K) switch the editor mode. Covers the palette wiring for the two
 * new modes plus the keyboard shortcuts registered in the action registry.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyScene } from "@oh-just-another/scene";
import { Editor, defaultActionRegistry } from "@oh-just-another/state";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, Toolbar, DEFAULT_TOOLBAR } from "../src/index";

installBuiltinRenderers();
afterEach(cleanup);

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

const btnByLabel = (root: HTMLElement, label: string): HTMLButtonElement | undefined =>
  [...root.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label) as
    | HTMLButtonElement
    | undefined;

describe("Toolbar eraser + laser tools", () => {
  let ctx: ReturnType<typeof mountEditor>;
  beforeEach(() => {
    ctx = mountEditor();
  });
  afterEach(() => ctx.cleanup());

  it("renders the eraser and laser buttons and activates them on click", () => {
    const { container } = render(<Toolbar items={DEFAULT_TOOLBAR} />, {
      wrapper: wrap(ctx.editor),
    });

    const eraser = btnByLabel(container, "Eraser tool (E)");
    const laser = btnByLabel(container, "Laser pointer (K)");
    expect(eraser).toBeDefined();
    expect(laser).toBeDefined();

    act(() => {
      eraser?.click();
    });
    expect(ctx.editor.mode).toBe("erase");

    act(() => {
      laser?.click();
    });
    expect(ctx.editor.mode).toBe("laser");
  });

  it("laser stays enabled in read-only; eraser disables (mutating tool)", () => {
    const { container } = render(<Toolbar items={DEFAULT_TOOLBAR} />, {
      wrapper: wrap(ctx.editor),
    });
    act(() => {
      ctx.editor.setReadOnly(true);
    });
    expect(btnByLabel(container, "Eraser tool (E)")?.disabled).toBe(true);
    expect(btnByLabel(container, "Laser pointer (K)")?.disabled).toBe(false);
  });

  it("dispatches the E / K hotkeys to switch modes", () => {
    act(() => {
      defaultActionRegistry.dispatchHotkey(new KeyboardEvent("keydown", { key: "e" }), {
        editor: ctx.editor,
      });
    });
    expect(ctx.editor.mode).toBe("erase");

    act(() => {
      defaultActionRegistry.dispatchHotkey(new KeyboardEvent("keydown", { key: "k" }), {
        editor: ctx.editor,
      });
    });
    expect(ctx.editor.mode).toBe("laser");
  });
});
