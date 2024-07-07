import { describe, expect, it, vi } from "vitest";
import { layerId, shapeId } from "@oh-just-another/types";
import {
  addLayer,
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Layer,
  type Shape,
} from "@oh-just-another/scene";
import {
  registerShapeRenderer,
  renderScene,
  type RenderTarget,
  type ShapeRenderer,
} from "../src/index";

/**
 * Minimal mock that records every method call, for verifying ordering,
 * transform stacking and which renderer was invoked for which shape.
 */
const makeRecorder = (): {
  target: RenderTarget;
  calls: { method: string; args: readonly unknown[] }[];
} => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const handler: ProxyHandler<object> = {
    get: (_target, prop: string) => {
      if (prop === "size") return { width: 1000, height: 1000 };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === "measureText") return { width: 10 };
        return undefined;
      };
    },
  };
  const target = new Proxy({}, handler) as unknown as RenderTarget;
  return { target, calls };
};

const rect = (id: string, layer = DEFAULT_LAYER_ID): Shape => ({
  id: shapeId(id),
  layerId: layer,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 10,
  height: 10,
});

describe("renderScene", () => {
  it("clears before drawing by default", () => {
    const { target, calls } = makeRecorder();
    renderScene(emptyScene(), target);
    expect(calls[0]?.method).toBe("clear");
  });

  it("skipClear suppresses the clear call", () => {
    const { target, calls } = makeRecorder();
    renderScene(emptyScene(), target, { skipClear: true });
    expect(calls.find((c) => c.method === "clear")).toBeUndefined();
  });

  it("invokes the registered renderer for each shape", () => {
    const renderer = vi.fn<ShapeRenderer>();
    registerShapeRenderer("test-rect", renderer);
    let scene = emptyScene();
    const r = rect("a");
    ({ scene } = addShape(scene, { ...r, type: "test-rect" }));
    ({ scene } = addShape(scene, { ...rect("b"), type: "test-rect" }));
    const { target } = makeRecorder();
    renderScene(scene, target);
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it("calls onUnknownShape for unregistered types", () => {
    const onUnknown = vi.fn();
    let scene = emptyScene();
    ({ scene } = addShape(scene, { ...rect("a"), type: "no-such-type" }));
    const { target } = makeRecorder();
    renderScene(scene, target, { onUnknownShape: onUnknown });
    expect(onUnknown).toHaveBeenCalledOnce();
  });

  it("skips hidden layers", () => {
    const renderer = vi.fn<ShapeRenderer>();
    registerShapeRenderer("hidden-test", renderer);
    let scene = emptyScene();
    const hidden: Layer = {
      id: layerId("hidden"),
      name: "Hidden",
      visible: false,
      locked: false,
      order: orderBetween(null, null),
    };
    ({ scene } = addLayer(scene, hidden));
    ({ scene } = addShape(scene, { ...rect("a", hidden.id), type: "hidden-test" }));
    const { target } = makeRecorder();
    renderScene(scene, target);
    expect(renderer).not.toHaveBeenCalled();
  });

  it("wraps each shape draw in save/restore", () => {
    const renderer = vi.fn<ShapeRenderer>();
    registerShapeRenderer("ss-test", renderer);
    let scene = emptyScene();
    ({ scene } = addShape(scene, { ...rect("a"), type: "ss-test" }));
    const { target, calls } = makeRecorder();
    renderScene(scene, target);
    // Outer save (for setTransform) + inner save (per shape).
    const saves = calls.filter((c) => c.method === "save").length;
    const restores = calls.filter((c) => c.method === "restore").length;
    expect(saves).toBe(restores);
    expect(saves).toBeGreaterThanOrEqual(2);
  });

  it("applies TRS transforms for each shape", () => {
    const renderer = vi.fn<ShapeRenderer>();
    registerShapeRenderer("trs-test", renderer);
    let scene = emptyScene();
    const r: Shape = {
      ...rect("a"),
      type: "trs-test",
      position: { x: 5, y: 7 },
      rotation: Math.PI / 4,
      scale: { x: 2, y: 3 },
    };
    ({ scene } = addShape(scene, r));
    const { target, calls } = makeRecorder();
    renderScene(scene, target);
    expect(calls.some((c) => c.method === "translate" && c.args[0] === 5 && c.args[1] === 7)).toBe(
      true,
    );
    expect(calls.some((c) => c.method === "rotate" && c.args[0] === Math.PI / 4)).toBe(true);
    expect(calls.some((c) => c.method === "scale" && c.args[0] === 2 && c.args[1] === 3)).toBe(
      true,
    );
  });
});
