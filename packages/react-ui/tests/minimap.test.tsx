import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement as sceneAddElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { Minimap } from "../src/index";

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
  width: 400,
  height: 300,
};

const seedScene = (): Scene => {
  let scene = emptyScene();
  ({ scene } = sceneAddElement(scene, rect));
  return { ...scene, viewport: { ...scene.viewport, size: { width: 200, height: 100 } } };
};

const mountEditor = (): { editor: Editor; cleanup: () => void } => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const layered = new LayeredCanvas(host, 200, 100);
  const editor = new Editor({
    host,
    mainTarget: layered.get("main"),
    overlayTarget: layered.get("overlay"),
    initialScene: seedScene(),
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

// Recording 2D context so we can assert the overview actually painted a shape.
const makeRecordingContext = (canvas: HTMLCanvasElement, rectCalls: { w: number }[]) => {
  const noop = () => undefined;
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "canvas") return canvas;
        if (prop === "measureText") return () => ({ width: 0 });
        if (prop === "getTransform")
          return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true, isIdentity: true });
        if (prop === "rect")
          return (_x: number, _y: number, w: number) => {
            rectCalls.push({ w });
          };
        return noop;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
};

describe("Minimap", () => {
  let ctx: ReturnType<typeof mountEditor>;
  let rectCalls: { w: number }[];
  let getCtxSpy: { mockRestore: () => void };

  beforeEach(() => {
    ctx = mountEditor();
    rectCalls = [];
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    spy.mockImplementation(function (this: HTMLCanvasElement, type: string) {
      return type === "2d" ? makeRecordingContext(this, rectCalls) : null;
    } as never);
    getCtxSpy = spy;
  });
  afterEach(() => {
    getCtxSpy.mockRestore();
    ctx.cleanup();
  });

  it("renders the scene overview into the minimap canvas", () => {
    const { container } = render(<Minimap editor={ctx.editor} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    // The single 400×300 rect must have reached the canvas via renderScene.
    expect(rectCalls.length).toBeGreaterThan(0);
  });

  it("uses default size from constants", () => {
    const { container } = render(<Minimap editor={ctx.editor} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.style.width).toBe("200px");
    expect(canvas.style.height).toBe("150px");
  });

  it("pans the main viewport on pointer down", () => {
    const panSpy = vi.spyOn(ctx.editor, "panBy");
    const { container } = render(<Minimap editor={ctx.editor} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(panSpy).toHaveBeenCalled();
  });

  it("zooms the main view in around the cursor on wheel up", () => {
    const zoomSpy = vi.spyOn(ctx.editor, "zoomAt");
    const before = ctx.editor.scene.viewport.zoom;
    const { container } = render(<Minimap editor={ctx.editor} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    // deltaY < 0 (wheel up) → factor > 1 → zoom in. Clamped to MAX_STEP.
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 20, clientY: 20 });
    expect(zoomSpy).toHaveBeenCalled();
    expect(zoomSpy.mock.calls[0]?.[0]).toBeGreaterThan(1);
    expect(ctx.editor.scene.viewport.zoom).toBeGreaterThan(before);
  });

  it("repaints after the throttle window when the editor notifies", () => {
    vi.useFakeTimers();
    try {
      render(<Minimap editor={ctx.editor} />);
      const before = rectCalls.length;
      // Panning the main view notifies subscribers; a burst collapses into one
      // trailing repaint after MINIMAP_THROTTLE_MS.
      ctx.editor.panBy({ x: 25, y: 25 });
      vi.advanceTimersByTime(200);
      expect(rectCalls.length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
