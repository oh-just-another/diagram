/**
 * Behavioural coverage for zen mode (⌥Z): the provider exposes a `zen`
 * flag that a consumer uses to hide chrome; the registered action toggles
 * it, and Escape exits while active.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyScene } from "@oh-just-another/scene";
import { Editor, defaultActionRegistry } from "@oh-just-another/state";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, ZenModeProvider, useZenMode } from "../src/index";

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

// Consumer that mirrors how the editor shell gates chrome on the zen flag.
const Chrome = (): ReactNode => {
  const { zen, toggle } = useZenMode();
  return (
    <div>
      {!zen && <div data-testid="chrome">toolbar</div>}
      <button type="button" onClick={toggle}>
        toggle
      </button>
    </div>
  );
};

const wrap =
  (editor: Editor) =>
  ({ children }: { children: ReactNode }) => (
    <DiagramProvider editor={editor}>
      <ZenModeProvider>{children}</ZenModeProvider>
    </DiagramProvider>
  );

describe("ZenModeProvider", () => {
  it("hides chrome when toggled via the action and restores it on re-toggle", () => {
    const ctx = mountEditor();
    const { queryByTestId } = render(<Chrome />, { wrapper: wrap(ctx.editor) });
    expect(queryByTestId("chrome")).not.toBeNull();
    act(() => {
      defaultActionRegistry.dispatch("toggle-zen-mode", { editor: ctx.editor });
    });
    expect(queryByTestId("chrome")).toBeNull();
    act(() => {
      defaultActionRegistry.dispatch("toggle-zen-mode", { editor: ctx.editor });
    });
    expect(queryByTestId("chrome")).not.toBeNull();
    ctx.cleanup();
  });

  it("exits zen on Escape", () => {
    const ctx = mountEditor();
    const { queryByTestId } = render(<Chrome />, { wrapper: wrap(ctx.editor) });
    act(() => {
      defaultActionRegistry.dispatch("toggle-zen-mode", { editor: ctx.editor });
    });
    expect(queryByTestId("chrome")).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(queryByTestId("chrome")).not.toBeNull();
    ctx.cleanup();
  });

  it("toggles via a consumer control", () => {
    const ctx = mountEditor();
    const { queryByTestId, getByText } = render(<Chrome />, { wrapper: wrap(ctx.editor) });
    act(() => {
      fireEvent.click(getByText("toggle"));
    });
    expect(queryByTestId("chrome")).toBeNull();
    ctx.cleanup();
  });
});
