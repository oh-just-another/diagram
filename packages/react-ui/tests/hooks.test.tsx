import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { elementId, layerId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement as sceneAddElement,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, useDiagram, useHistory, useMode, useSelection } from "../src/index";

void layerId; // imported for type tests below

installBuiltinRenderers();

const rect: Element = {
  id: elementId("r1"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc" },
  width: 50,
  height: 50,
};

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

const wrap = (editor: Editor) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <DiagramProvider editor={editor}>{children}</DiagramProvider>
  );
  return Wrapper;
};

describe("react-ui hooks", () => {
  let ctx: ReturnType<typeof mountEditor>;
  beforeEach(() => {
    ctx = mountEditor();
  });
  afterEach(() => ctx.cleanup());

  it("useDiagram returns the live editor instance", () => {
    const seen = vi.fn<(e: Editor) => void>();
    const Probe = () => {
      seen(useDiagram());
      return null;
    };
    render(<Probe />, { wrapper: wrap(ctx.editor) });
    expect(seen).toHaveBeenCalledWith(ctx.editor);
  });

  it("useSelection reflects editor selection changes", () => {
    const Probe = () => {
      const sel = useSelection();
      return <span data-testid="size">{sel.size}</span>;
    };
    render(<Probe />, { wrapper: wrap(ctx.editor) });
    expect(screen.getByTestId("size").textContent).toBe("0");

    act(() => {
      ctx.editor.addElement(rect);
    });
    // addElement selects the new shape by default.
    expect(screen.getByTestId("size").textContent).toBe("1");
  });

  it("useMode reflects setMode", () => {
    const Probe = () => {
      const mode = useMode();
      return <span data-testid="mode">{mode}</span>;
    };
    render(<Probe />, { wrapper: wrap(ctx.editor) });
    expect(screen.getByTestId("mode").textContent).toBe("select");
    act(() => {
      ctx.editor.setMode("draw-rect");
    });
    expect(screen.getByTestId("mode").textContent).toBe("draw-rect");
  });

  it("useHistory exposes canUndo / canRedo + actions", () => {
    const Probe = () => {
      const { canUndo, canRedo, undo, redo } = useHistory();
      return (
        <div>
          <span data-testid="canUndo">{String(canUndo)}</span>
          <span data-testid="canRedo">{String(canRedo)}</span>
          <button onClick={undo}>U</button>
          <button onClick={redo}>R</button>
        </div>
      );
    };
    render(<Probe />, { wrapper: wrap(ctx.editor) });
    expect(screen.getByTestId("canUndo").textContent).toBe("false");

    act(() => {
      ctx.editor.addElement(rect);
    });
    expect(screen.getByTestId("canUndo").textContent).toBe("true");
    expect(screen.getByTestId("canRedo").textContent).toBe("false");

    act(() => {
      ctx.editor.undo();
    });
    expect(screen.getByTestId("canUndo").textContent).toBe("false");
    expect(screen.getByTestId("canRedo").textContent).toBe("true");
  });

  it("throws when used outside provider", () => {
    const Probe = () => {
      useDiagram();
      return null;
    };
    expect(() => render(<Probe />)).toThrow(/outside <DiagramProvider>/);
  });
});

void sceneAddElement; // imported to keep parity with how hosts use the package
