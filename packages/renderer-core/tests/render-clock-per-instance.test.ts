/**
 * The animated-content playback clock is a per-instance render provider,
 * threaded through `RenderSceneOptions.clock` → `ElementRenderContext.clock`
 * rather than the process-global `setAnimationClock`. Two `renderScene` passes
 * with different clocks must sample the animation adapter at different
 * timestamps (no shared-global interference), while a pass with no clock falls
 * back to the module clock so headless / preview paths keep working.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type ImageElement,
} from "@oh-just-another/scene";
import {
  installBuiltinRenderers,
  registerAnimationAdapter,
  unregisterAnimationAdapter,
  resetAnimationClock,
  setAnimationClock,
  renderScene,
  type RenderTarget,
} from "../src/index";

beforeAll(() => {
  installBuiltinRenderers();
});

afterEach(() => {
  unregisterAnimationAdapter("gif");
  resetAnimationClock();
});

/** Records the timestamp `drawImage` was handed (the frame the adapter returned). */
const makeRecorder = (): {
  target: RenderTarget;
  drawn: unknown[];
} => {
  const drawn: unknown[] = [];
  const handler: ProxyHandler<object> = {
    get: (_t, prop: string) => {
      if (prop === "size") return { width: 1000, height: 1000 };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        if (prop === "drawImage") drawn.push(args[0]);
        return undefined;
      };
    },
  };
  return { target: new Proxy({}, handler) as unknown as RenderTarget, drawn };
};

const animatedImage = (): ImageElement => ({
  id: elementId("img-1"),
  type: "image",
  layerId: DEFAULT_LAYER_ID,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  src: "static",
  width: 10,
  height: 10,
  animationKind: "gif",
  animationData: { id: "d" },
});

const sceneWithImage = () => {
  let scene = emptyScene();
  ({ scene } = addElement(scene, animatedImage()));
  return scene;
};

describe("per-instance animation clock via render context", () => {
  it("two renders with different clocks sample the adapter at different timestamps", () => {
    // Adapter echoes the timestamp it was sampled at as the frame handle.
    registerAnimationAdapter({ kind: "gif", getFrameAt: (_d, t) => `frame@${String(t)}` });

    const scene = sceneWithImage();

    const a = makeRecorder();
    renderScene(scene, a.target, { clock: () => 100 });

    const b = makeRecorder();
    renderScene(scene, b.target, { clock: () => 250 });

    expect(a.drawn).toEqual(["frame@100"]);
    expect(b.drawn).toEqual(["frame@250"]);
  });

  it("the per-instance clock is called with the shape being drawn", () => {
    registerAnimationAdapter({ kind: "gif", getFrameAt: (_d, t) => `frame@${String(t)}` });
    const clock = vi.fn((_shape: { readonly id?: unknown }) => 42);
    renderScene(sceneWithImage(), makeRecorder().target, { clock });
    expect(clock).toHaveBeenCalledTimes(1);
    expect(clock.mock.calls[0]?.[0]).toMatchObject({ id: elementId("img-1") });
  });

  it("falls back to the process-global clock when no per-instance clock is passed", () => {
    registerAnimationAdapter({ kind: "gif", getFrameAt: (_d, t) => `frame@${String(t)}` });
    setAnimationClock(() => 777);
    const r = makeRecorder();
    renderScene(sceneWithImage(), r.target); // no clock option
    expect(r.drawn).toEqual(["frame@777"]);
  });

  it("the render-context clock does not leak into the process-global fallback", () => {
    registerAnimationAdapter({ kind: "gif", getFrameAt: (_d, t) => `frame@${String(t)}` });
    setAnimationClock(() => 5);
    // Render with a per-instance clock…
    renderScene(sceneWithImage(), makeRecorder().target, { clock: () => 999 });
    // …then a render WITHOUT one must still see the untouched module clock.
    const r = makeRecorder();
    renderScene(sceneWithImage(), r.target);
    expect(r.drawn).toEqual(["frame@5"]);
  });
});
