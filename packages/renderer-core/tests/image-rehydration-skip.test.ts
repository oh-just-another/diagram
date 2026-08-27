/**
 * The image element renderer must distinguish "rehydration pending" from
 * "permanently broken": a restored shape with a `fileId` and a dead handle
 * (string blob: src / `{}` from a serialised <img>) is skipped SILENTLY —
 * async rehydration from Scene.files repaints it moments later, so no
 * warning belongs in the console. Only a shape with no rehydration source
 * reaches the backend (which warns that it will stay blank).
 */
import { describe, expect, it, beforeAll, vi } from "vitest";
import { elementId, fileId } from "@oh-just-another/types";
import {
  addElement,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { installBuiltinRenderers, renderScene, type RenderTarget } from "../src/index";

beforeAll(() => {
  installBuiltinRenderers();
});

const makeRecorder = (): {
  target: RenderTarget;
  calls: { method: string; args: readonly unknown[] }[];
} => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const handler: ProxyHandler<object> = {
    get: (_t, prop: string) => {
      if (prop === "size") return { width: 1000, height: 1000 };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === "measureText")
          return { width: typeof args[0] === "string" ? args[0].length * 7 : 0 };
        return undefined;
      };
    },
  };
  return { target: new Proxy({}, handler) as unknown as RenderTarget, calls };
};

const imageShape = (extra: Partial<Element>): Element =>
  ({
    id: elementId("img"),
    layerId: DEFAULT_LAYER_ID,
    type: "image",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    src: "blob:http://localhost/dead-after-reload",
    width: 100,
    height: 80,
    ...extra,
  }) as Element;

const render = (el: Element) => {
  const { target, calls } = makeRecorder();
  let scene: Scene = emptyScene();
  ({ scene } = addElement(scene, el));
  renderScene(scene, target);
  return calls;
};

class FakeBitmap {
  readonly width = 4;
  readonly height = 4;
}
vi.stubGlobal("ImageBitmap", FakeBitmap);

describe("image renderer vs rehydration", () => {
  it("skips drawImage silently while a fileId shape awaits rehydration", () => {
    const calls = render(
      imageShape({ fileId: fileId("f1"), metadata: {} }), // dead blob: src, bytes exist
    );
    expect(calls.some((c) => c.method === "drawImage")).toBe(false);
  });

  it("skips a serialised-to-{} handle silently when a fileId exists", () => {
    const calls = render(imageShape({ fileId: fileId("f1"), metadata: { image: {} } }));
    expect(calls.some((c) => c.method === "drawImage")).toBe(false);
  });

  it("forwards a dead handle WITHOUT a fileId to the backend (which warns)", () => {
    const calls = render(imageShape({ metadata: {} }));
    const draw = calls.find((c) => c.method === "drawImage");
    expect(draw).toBeDefined();
  });

  it("draws normally once a live handle is attached", () => {
    const live = new FakeBitmap() as unknown as ImageBitmap;
    const calls = render(imageShape({ fileId: fileId("f1"), metadata: { image: live } }));
    const draw = calls.find((c) => c.method === "drawImage");
    expect(draw?.args[0]).toBe(live);
  });
});
