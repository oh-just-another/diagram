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
});
