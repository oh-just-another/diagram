/**
 * Render scheduling must die with the editor: async completions (image
 * decode, font load, wasm init) can resolve after the host tears the
 * editor down (runtime backend switch) and used to schedule a render
 * onto DISPOSED targets — on WebGL2 that recompiled shaders on a lost
 * context and threw "shader compile failed: null" inside a promise.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
});

// Counting target: records how many frames were painted onto it.
const makeCountingTarget = (counter: { frames: number }) =>
  new Proxy(
    {
      measureText: () => ({ width: 0 }),
      size: { width: 800, height: 600 },
      clear: () => {
        counter.frames += 1;
      },
    } as Record<string, unknown>,
    { get: (o, k: string) => (k in o ? o[k] : () => undefined) },
  ) as never;

const makeHost = () =>
  ({
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  }) as never;

describe("Editor render scheduling after dispose", () => {
  it("forceRender after dispose paints nothing and does not throw", () => {
    const counter = { frames: 0 };
    const editor = new Editor({
      host: makeHost(),
      mainTarget: makeCountingTarget(counter),
      overlayTarget: makeCountingTarget(counter),
      initialScene: addElement(emptyScene(), rect("a")).scene,
    });
    editor.setViewportSize(800, 600);
    editor.forceRender();
    const painted = counter.frames;
    expect(painted).toBeGreaterThan(0);

    editor.dispose();
    expect(() => editor.forceRender()).not.toThrow();
    expect(counter.frames).toBe(painted);
  });

  it("scene mutations after dispose do not schedule a render", () => {
    const counter = { frames: 0 };
    const editor = new Editor({
      host: makeHost(),
      mainTarget: makeCountingTarget(counter),
      overlayTarget: makeCountingTarget(counter),
      initialScene: addElement(emptyScene(), rect("a")).scene,
    });
    editor.setViewportSize(800, 600);
    editor.forceRender();
    editor.dispose();
    const painted = counter.frames;

    // A late async completion typically lands as a scene/viewport nudge.
    editor.panBy({ x: 10, y: 10 });
    expect(counter.frames).toBe(painted);
  });
});
