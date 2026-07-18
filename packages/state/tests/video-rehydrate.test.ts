// @vitest-environment jsdom
/**
 * mp4 must survive a reload. Two halves:
 * - the video file-drop handler persists the bytes into `Scene.files`
 *   (without a `fileId` there is nothing to restore from), and
 * - `rehydrateStaticImages` rebuilds a live hidden looping `<video>` handle
 *   from those bytes for a restored video shape (image mime keeps the old
 *   ImageBitmap/<img> path).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementId, type FileId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  getBinaryFile,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { emptyScene } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { videoFileDropHandler } from "../src/features/built-in-handlers.js";
import { rehydrateStaticImages } from "../src/editor/animation-scene.js";

const noopTarget = new Proxy(
  { measureText: () => ({ width: 0 }), size: { width: 800, height: 600 } } as Record<
    string,
    unknown
  >,
  { get: (o, k: string) => (k in o ? o[k] : () => undefined) },
) as never;

const makeEditor = (): Editor =>
  new Editor({
    host: new Proxy({ style: { cursor: "" } } as Record<string, unknown>, {
      get: (o, k: string) =>
        k in o
          ? o[k]
          : k === "getBoundingClientRect"
            ? () => ({ left: 0, top: 0, width: 800, height: 600 })
            : () => undefined,
    }) as never,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: emptyScene(),
  });

const SINK_ID = "oh-just-another-animated-image-sink";

/**
 * jsdom's Blob/File implements no `arrayBuffer()`; back-fill an instance-own
 * method from the known bytes (same workaround as built-in-handlers.test.ts).
 */
const withBytes = <T extends Blob>(blob: T, bytes: Uint8Array): T => {
  if (typeof blob.arrayBuffer !== "function") {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    Object.defineProperty(blob, "arrayBuffer", {
      configurable: true,
      value: () => Promise.resolve(buffer),
    });
  }
  return blob;
};

/** Fire `loadedmetadata` on the sink's <video> once it appears. */
const settleVideo = async (): Promise<HTMLVideoElement> => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
    const video = document.getElementById(SINK_ID)?.querySelector("video");
    if (video) {
      Object.defineProperty(video, "videoWidth", { value: 320 });
      Object.defineProperty(video, "videoHeight", { value: 180 });
      // jsdom's play() returns undefined (and logs "Not implemented");
      // the production `.catch()` chain needs a real promise.
      Object.defineProperty(video, "play", { value: () => Promise.resolve() });
      video.dispatchEvent(new Event("loadedmetadata"));
      return video;
    }
  }
  throw new Error("video element never appeared in the sink");
};

describe("video persistence across reloads", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.getElementById(SINK_ID)?.remove();
  });

  it("the drop handler persists the bytes and links the shape via fileId", async () => {
    const editor = makeEditor();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = withBytes(new File([bytes], "clip.mp4", { type: "video/mp4" }), bytes);
    const done = videoFileDropHandler.handle(file, { editor, worldPoint: { x: 100, y: 100 } });
    const video = await settleVideo();
    // The handler's `onloadedmetadata` assignment may land after the first
    // event in jsdom's microtask ordering — fire once more to be safe.
    video.dispatchEvent(new Event("loadedmetadata"));
    await done;

    expect(editor.scene.files.size).toBe(1);
    const shape = [...editor.scene.elements.values()][0] as Element & {
      fileId?: FileId;
      metadata?: { image?: unknown; animated?: boolean };
    };
    expect(shape.fileId).toBeDefined();
    expect(getBinaryFile(editor.scene, shape.fileId!)?.mime).toBe("video/mp4");
    expect(shape.metadata?.animated).toBe(true);
    editor.dispose();
  });

  it("rehydrateStaticImages rebuilds a live <video> handle from Scene.files", async () => {
    const editor = makeEditor();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const blob = withBytes(new Blob([bytes], { type: "video/mp4" }), bytes);
    const fileId = await editor.addBinaryFile(blob, "clip.mp4");
    // A restored video shape: dead src, no live handle, animated flag kept.
    editor.addElement({
      id: elementId("v1"),
      layerId: DEFAULT_LAYER_ID,
      type: "image",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      src: "blob:dead",
      width: 320,
      height: 180,
      fileId,
      metadata: { animated: true },
    } as unknown as Element);

    const done = rehydrateStaticImages(editor);
    await settleVideo();
    await done;

    const shape = editor.scene.elements.get(elementId("v1")) as Element & {
      metadata?: { image?: unknown };
    };
    expect(shape.metadata?.image).toBeInstanceOf(HTMLVideoElement);
    editor.dispose();
  });
});
