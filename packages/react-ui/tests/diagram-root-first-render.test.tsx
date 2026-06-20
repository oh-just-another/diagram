import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import type { Editor } from "@oh-just-another/state";
import { DiagramRoot, DiagramSurface, useDiagramOptional } from "../src/index";

const rect: Element = {
  id: elementId("a"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 100, y: 100 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#ff0000" },
  width: 50,
  height: 50,
};

const seedScene = (): Scene => {
  const { scene } = addElement(emptyScene(), rect);
  return scene;
};

const makeMockContext = (callLog: { args: number[] }[]): CanvasRenderingContext2D => {
  // jsdom has no Canvas2D implementation; hand the editor a recording
  // stub that satisfies the API surface Canvas2DTarget touches.
  const noop = () => {};
  const ctx = {
    canvas: { width: 0, height: 0 },
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setTransform: noop,
    resetTransform: noop,
    clearRect: noop,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    setLineDash: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    rect: (x: number, y: number, w: number, h: number) => {
      callLog.push({ args: [x, y, w, h] });
    },
    ellipse: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    measureText: () => ({ width: 0 }),
    drawImage: noop,
  } as unknown as CanvasRenderingContext2D;
  return ctx;
};

const captureFillCalls = () => {
  const callLog: { args: number[] }[] = [];
  const stub = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    type: string,
  ) {
    if (type !== "2d") return null;
    const ctx = makeMockContext(callLog);
    (ctx as { canvas: HTMLCanvasElement }).canvas = this;
    return ctx;
  });
  return { callLog, restore: () => stub.mockRestore() };
};

describe("DiagramRoot first render", () => {
  it("paints initial shapes to the canvas via DiagramSurface", async () => {
    // jsdom canvas doesn't paint, but it records method calls on
    // CanvasRenderingContext2D. Spying on `rect` counts how often the
    // renderer asked the canvas to paint our shape — > 0 means the editor
    // reached the canvas with real content.
    const { callLog, restore } = captureFillCalls();
    let capturedEditor: Editor | null = null;

    const ProbeRoot = () => {
      const e = useDiagramOptional();
      useEffect(() => {
        capturedEditor = e ?? null;
      }, [e]);
      return null;
    };

    const result = render(
      <DiagramRoot initialScene={seedScene()} initialMode="select" skipInstallRenderers={false}>
        <ProbeRoot />
        <DiagramSurface style={{ width: 800, height: 600 }} />
      </DiagramRoot>,
    );
    // Find the DOM node DiagramSurface mounted.
    const host = result.container.querySelector('[role="application"]') as HTMLDivElement | null;
    // jsdom doesn't run ResizeObserver — kick the editor manually with a
    // real-size viewport so the rendering path runs end-to-end.
    if (capturedEditor) {
      act(() => {
        (capturedEditor as Editor).setViewportSize(800, 600);
      });
    }
    // Wait a microtask so any queued render landing inside React's batched
    // lifecycle gets flushed.
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      capturedEditor,
      "DiagramRoot should have created an editor that the probe can see",
    ).not.toBeNull();
    const rectCalls = callLog.filter((c) => c.args[2] === 50 && c.args[3] === 50);
    expect(
      rectCalls.length,
      `Expected at least one 50×50 rect call after mount + setViewportSize. ` +
        `Total rect calls: ${callLog.length}. ` +
        `host attached: ${host !== null}. ` +
        `Sample: ${JSON.stringify(callLog.slice(0, 5))}`,
    ).toBeGreaterThan(0);

    result.unmount();
    restore();
  });

  it("repaints synchronously on resize — no blank frame (flicker fix)", () => {
    const { restore } = captureFillCalls();

    // Capture the ResizeObserver callback DiagramRoot registers so we can fire
    // it deterministically (jsdom doesn't run layout). The default test stub is
    // a no-op; override it for this test, then restore.
    const callbacks: ResizeObserverCallback[] = [];
    const PrevRO = globalThis.ResizeObserver;
    class CapturingResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = CapturingResizeObserver as unknown as typeof ResizeObserver;

    // Holder object rather than a `let`: the assignment happens inside the
    // ProbeRoot effect (a closure), so control-flow analysis would narrow a
    // bare `let` back to its `null` initializer at the top-scope read below.
    // A property read keeps the declared `Editor | null` type.
    const captured: { editor: Editor | null } = { editor: null };
    const ProbeRoot = () => {
      const e = useDiagramOptional();
      useEffect(() => {
        captured.editor = e ?? null;
      }, [e]);
      return null;
    };

    const result = render(
      <DiagramRoot initialScene={seedScene()} initialMode="select" skipInstallRenderers={false}>
        <ProbeRoot />
        <DiagramSurface style={{ width: 800, height: 600 }} />
      </DiagramRoot>,
    );

    try {
      expect(captured.editor, "DiagramRoot should have created an editor").not.toBeNull();
      expect(callbacks.length, "DiagramRoot should register a ResizeObserver").toBeGreaterThan(0);

      const editor = captured.editor as Editor;
      const forceRenderSpy = vi.spyOn(editor, "forceRender");

      // Fire the resize callback. The fix must repaint synchronously inside the
      // callback (which runs before the browser paints) — deferring to rAF lets
      // the cleared canvas paint first, which is the flicker. No await here:
      // the assertion pins that the repaint is synchronous.
      act(() => {
        callbacks.forEach((cb) => {
          cb([], {} as ResizeObserver);
        });
      });

      expect(
        forceRenderSpy,
        "resize must repaint synchronously via forceRender; deferring to rAF flickers",
      ).toHaveBeenCalled();

      forceRenderSpy.mockRestore();
    } finally {
      globalThis.ResizeObserver = PrevRO;
      result.unmount();
      restore();
    }
  });
});
