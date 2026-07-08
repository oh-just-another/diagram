import { afterEach, describe, expect, it, vi } from "vitest";
import { elementId, type ElementId } from "@oh-just-another/types";
import { emptyScene, getElement, type Scene } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import {
  autoStopHeavyGifs,
  hasVisibleAnimatedElement,
  rehydrateAnimatedImages,
} from "../src/editor/animation-scene.js";
import { HEAVY_GIF_BYTES } from "../src/constants.js";

// Behavioural coverage for the animation-scene helpers: viewport-culled
// visibility of animated shapes, the heavy-GIF auto-stop collector, and the
// post-load rehydration that restores transient animationData bytes.

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;

const makeEditor = (scene: Scene = emptyScene()) => {
  const host = {
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });
};

describe("hasVisibleAnimatedElement", () => {
  it("is false when the scene has no animated element", () => {
    const editor = makeEditor();
    editor.insertImage({ src: "data:,", width: 20, height: 20, position: { x: 0, y: 0 } });
    expect(hasVisibleAnimatedElement(editor)).toBe(false);
    editor.dispose();
  });

  it("is true when an animated element is present but no viewport is sized yet", () => {
    // viewport.size defaults to 0×0 → computeViewportWorld returns null → the
    // predicate cannot cull, so it optimistically reports visible.
    const editor = makeEditor();
    editor.insertImage({
      src: "data:,",
      width: 20,
      height: 20,
      position: { x: 5, y: 5 },
      animated: true,
      animationKind: "gif",
    });
    expect(editor.computeViewportWorld()).toBeNull();
    expect(hasVisibleAnimatedElement(editor)).toBe(true);
    editor.dispose();
  });

  it("is true when the animated element's AABB intersects the sized viewport", () => {
    const editor = makeEditor();
    editor.setViewportSize(800, 600);
    editor.insertImage({
      src: "data:,",
      width: 40,
      height: 40,
      position: { x: 100, y: 100 },
      animated: true,
      animationKind: "gif",
    });
    expect(editor.computeViewportWorld()).not.toBeNull();
    expect(hasVisibleAnimatedElement(editor)).toBe(true);
    editor.dispose();
  });

  it("is false when the only animated element sits far outside the viewport", () => {
    const editor = makeEditor();
    editor.setViewportSize(800, 600);
    editor.insertImage({
      src: "data:,",
      width: 40,
      height: 40,
      position: { x: 500000, y: 500000 },
      animated: true,
      animationKind: "gif",
    });
    expect(hasVisibleAnimatedElement(editor)).toBe(false);
    editor.dispose();
  });
});

describe("autoStopHeavyGifs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collects only heavy animated images (>HEAVY_GIF_BYTES) and hands them to the controller", () => {
    const editor = makeEditor();
    const heavy = editor.insertImage({
      src: "data:,",
      width: 20,
      height: 20,
      position: { x: 0, y: 0 },
      animated: true,
      animationKind: "gif",
      animationData: new ArrayBuffer(HEAVY_GIF_BYTES + 1),
    });
    const light = editor.insertImage({
      src: "data:,",
      width: 20,
      height: 20,
      position: { x: 40, y: 40 },
      animated: true,
      animationKind: "gif",
      animationData: new ArrayBuffer(16),
    });
    const spy = vi.spyOn(editor.gifPlayback, "autoStopHeavy");
    autoStopHeavyGifs(editor);
    expect(spy).toHaveBeenCalledTimes(1);
    const ids = spy.mock.calls[0]![0] as ElementId[];
    expect(ids).toContain(heavy);
    expect(ids).not.toContain(light);
    editor.dispose();
  });

  it("passes an empty list when nothing qualifies as heavy", () => {
    const editor = makeEditor();
    editor.insertImage({
      src: "data:,",
      width: 20,
      height: 20,
      position: { x: 0, y: 0 },
      animated: true,
      animationKind: "gif",
      animationData: new ArrayBuffer(8),
    });
    const spy = vi.spyOn(editor.gifPlayback, "autoStopHeavy");
    autoStopHeavyGifs(editor);
    expect(spy).toHaveBeenCalledWith([]);
    editor.dispose();
  });

  it("ignores animated images whose animationData is not raw bytes", () => {
    const editor = makeEditor();
    editor.insertImage({
      src: "data:,",
      width: 20,
      height: 20,
      position: { x: 0, y: 0 },
      animated: true,
      animationKind: "gif",
      // A live decoder handle rather than an ArrayBuffer — never counts as heavy.
      animationData: { decoded: true },
    });
    const spy = vi.spyOn(editor.gifPlayback, "autoStopHeavy");
    autoStopHeavyGifs(editor);
    expect(spy).toHaveBeenCalledWith([]);
    editor.dispose();
  });
});

describe("rehydrateAnimatedImages", () => {
  it("restores animationData bytes from the scene's file store and seeds playback", async () => {
    const editor = makeEditor();
    const bytes = new Uint8Array([7, 7, 7, 7]);
    const fileId = await editor.addBinaryFile(new Blob([bytes], { type: "image/gif" }), "a.gif");
    // Insert an animated image that references the file but has NO live bytes —
    // exactly the state after deserialisation (animationData does not survive
    // serialise, only the fileId does).
    const id = editor.insertImage({
      src: "data:,",
      width: 20,
      height: 20,
      position: { x: 0, y: 0 },
      animated: true,
      animationKind: "gif",
      fileId,
    });
    const before = getElement(editor.scene, id) as { animationData?: unknown };
    expect(before.animationData).toBeUndefined();

    const ensureSpy = vi.spyOn(editor.gifPlayback, "ensure");
    rehydrateAnimatedImages(editor);

    const after = getElement(editor.scene, id) as { animationData?: ArrayBuffer };
    expect(after.animationData).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(after.animationData!)).toEqual(bytes);
    expect(ensureSpy).toHaveBeenCalledWith(id);
    vi.restoreAllMocks();
    editor.dispose();
  });

  it("leaves already-live animationData untouched", () => {
    const editor = makeEditor();
    const live = new ArrayBuffer(4);
    const id = editor.insertImage({
      src: "data:,",
      width: 20,
      height: 20,
      position: { x: 0, y: 0 },
      animated: true,
      animationKind: "gif",
      animationData: live,
    });
    rehydrateAnimatedImages(editor);
    const after = getElement(editor.scene, id) as { animationData?: ArrayBuffer };
    expect(after.animationData).toBe(live);
    editor.dispose();
  });

  it("is a no-op for a non-animated image (no animationKind)", () => {
    const editor = makeEditor();
    const id = editor.insertImage({
      src: "data:,",
      width: 20,
      height: 20,
      position: { x: 0, y: 0 },
    });
    const ensureSpy = vi.spyOn(editor.gifPlayback, "ensure");
    rehydrateAnimatedImages(editor);
    expect(ensureSpy).not.toHaveBeenCalledWith(id);
    vi.restoreAllMocks();
    editor.dispose();
  });

  it("ignores an animated image with no fileId (nothing to restore from)", () => {
    const editor = makeEditor();
    const id = editor.insertImage({
      src: "data:,",
      width: 20,
      height: 20,
      position: { x: 0, y: 0 },
      animated: true,
      animationKind: "gif",
    });
    // ensure() still seeds playback, but animationData stays absent.
    rehydrateAnimatedImages(editor);
    const after = getElement(editor.scene, id) as { animationData?: unknown };
    expect(after.animationData).toBeUndefined();
    expect(elementId(String(id))).toBe(id);
    editor.dispose();
  });
});
