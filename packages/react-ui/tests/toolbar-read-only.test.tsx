/**
 * Behavioural coverage for read-only chrome: creation tools in the toolbar
 * disable themselves when the editor enters view mode, while navigation
 * (select / hand) stays enabled. Toggling read-only off re-enables them.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

/** Find a toolbar button by its accessible name (aria-label). */
const btnByLabel = (root: HTMLElement, label: string): HTMLButtonElement | undefined =>
  [...root.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label) as
    | HTMLButtonElement
    | undefined;

describe("Toolbar read-only chrome", () => {
  let ctx: ReturnType<typeof mountEditor>;
  beforeEach(() => {
    ctx = mountEditor();
  });
  afterEach(() => ctx.cleanup());

  it("disables creation tools in read-only but keeps select / hand enabled", () => {
    const { container } = render(<Toolbar items={DEFAULT_VERTICAL_TOOLBAR} />, {
      wrapper: wrap(ctx.editor),
    });

    // Editable: rectangle tool is enabled.
    expect(btnByLabel(container, "Rectangle tool (R)")?.disabled).toBe(false);

    act(() => {
      ctx.editor.setReadOnly(true);
    });

    // Creation tools disabled …
    expect(btnByLabel(container, "Rectangle tool (R)")?.disabled).toBe(true);
    expect(btnByLabel(container, "Ellipse tool (O)")?.disabled).toBe(true);
    expect(btnByLabel(container, "Insert image (I)")?.disabled).toBe(true);
    // … navigation stays live.
    expect(btnByLabel(container, "Select tool (V)")?.disabled).toBe(false);
    expect(btnByLabel(container, "Hand tool (H)")?.disabled).toBe(false);

    act(() => {
      ctx.editor.setReadOnly(false);
    });
    expect(btnByLabel(container, "Rectangle tool (R)")?.disabled).toBe(false);
  });
});
