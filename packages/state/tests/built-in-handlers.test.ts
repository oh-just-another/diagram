// @vitest-environment jsdom
/**
 * Behavioural tests for the built-in file-drop handlers
 * (`built-in-handlers.ts`). jsdom cannot decode real images or videos,
 * so `Image` is replaced with a subclass that fires `onload`/`onerror`
 * on a microtask and reports scripted natural dimensions, and the
 * `<video>` element created by the handler gets its `loadedmetadata`
 * callback driven manually.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imageFileDropHandler, videoFileDropHandler } from "../src/built-in-handlers.js";
import { DEFAULT_IMAGE_MAX_EDGE_PX } from "../src/constants.js";
import type { FileDropContext } from "../src/file-drop.js";
import type { Editor } from "../src/editor.js";

// ---------------------------------------------------------------------------
// Fake <img> — fires onload (or onerror when src includes "decode-fail")
// on a microtask, with scripted natural dimensions.
// ---------------------------------------------------------------------------

let naturalSize = { width: 100, height: 50 };

class FakeImage extends window.Image {
  #loaded = false;
  #src = "";

  override get complete(): boolean {
    return this.#loaded;
  }

  override get naturalWidth(): number {
    return this.#loaded ? naturalSize.width : 0;
  }

  override get naturalHeight(): number {
    return this.#loaded ? naturalSize.height : 0;
  }

  override get src(): string {
    return this.#src;
  }

  override set src(value: string) {
    this.#src = value;
    queueMicrotask(() => {
      if (value.includes("decode-fail")) {
        this.onerror?.(new Event("error"));
        return;
      }
      this.#loaded = true;
      this.onload?.(new Event("load"));
    });
  }
}

// ---------------------------------------------------------------------------
// Editor stub — only the two methods the handlers call.
// ---------------------------------------------------------------------------

interface EditorStub {
  addBinaryFile: ReturnType<typeof vi.fn>;
  insertImage: ReturnType<typeof vi.fn>;
}

const makeContext = (): { editor: EditorStub; ctx: FileDropContext } => {
  const editor: EditorStub = {
    addBinaryFile: vi.fn().mockResolvedValue("file-1"),
    insertImage: vi.fn().mockReturnValue("el-1"),
  };
  return {
    editor,
    ctx: { editor: editor as unknown as Editor, worldPoint: { x: 200, y: 100 } },
  };
};

const pngFile = (name = "photo.png"): File =>
  new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
  naturalSize = { width: 100, height: 50 };
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById("oh-just-another-animated-image-sink")?.remove();
});

describe("imageFileDropHandler.accept", () => {
  it("accepts image files and rejects everything else", () => {
    expect(imageFileDropHandler.accept(pngFile())).toBe(true);
    expect(imageFileDropHandler.accept(new File([""], "clip.mp4", { type: "video/mp4" }))).toBe(
      false,
    );
    expect(imageFileDropHandler.id).toBe("image");
  });
});

describe("imageFileDropHandler.handle", () => {
  it("registers the blob, measures the image and inserts it centered on the drop point", async () => {
    const { editor, ctx } = makeContext();
    await imageFileDropHandler.handle(pngFile(), ctx);

    expect(editor.addBinaryFile).toHaveBeenCalledOnce();
    expect(editor.insertImage).toHaveBeenCalledOnce();
    const input = editor.insertImage.mock.calls[0]![0] as {
      src: string;
      fileId: string;
      width: number;
      height: number;
      position: { x: number; y: number };
      animated: boolean;
    };
    expect(input.fileId).toBe("file-1");
    expect(input.width).toBe(100);
    expect(input.height).toBe(50);
    // Centered: worldPoint (200,100) minus half the size.
    expect(input.position).toEqual({ x: 150, y: 75 });
    expect(input.animated).toBe(false);
    // jsdom has no URL.createObjectURL → dataURL fallback path.
    expect(input.src.startsWith("data:")).toBe(true);
  });

  it("downscales the longer edge to DEFAULT_IMAGE_MAX_EDGE_PX", async () => {
    naturalSize = { width: 4000, height: 2000 };
    const { editor, ctx } = makeContext();
    await imageFileDropHandler.handle(pngFile(), ctx);

    const input = editor.insertImage.mock.calls[0]![0] as { width: number; height: number };
    expect(input.width).toBe(DEFAULT_IMAGE_MAX_EDGE_PX);
    expect(input.height).toBe(Math.round(2000 * (DEFAULT_IMAGE_MAX_EDGE_PX / 4000)));
  });

  it("uses URL.createObjectURL when available", async () => {
    const createObjectURL = vi.fn(() => "blob:fake-object-url");
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL }));
    const { editor, ctx } = makeContext();
    await imageFileDropHandler.handle(pngFile(), ctx);

    expect(createObjectURL).toHaveBeenCalledOnce();
    const input = editor.insertImage.mock.calls[0]![0] as { src: string };
    expect(input.src).toBe("blob:fake-object-url");
  });

  it("attaches the decoded <img> to the hidden animated-image sink", async () => {
    const { ctx } = makeContext();
    await imageFileDropHandler.handle(pngFile(), ctx);

    const sink = document.getElementById("oh-just-another-animated-image-sink");
    expect(sink).not.toBeNull();
    expect(sink!.querySelectorAll("img").length).toBe(1);
    expect(sink!.getAttribute("aria-hidden")).toBe("true");
  });

  it("reuses the existing sink for subsequent drops", async () => {
    const { ctx } = makeContext();
    await imageFileDropHandler.handle(pngFile(), ctx);
    await imageFileDropHandler.handle(pngFile(), ctx);

    expect(document.querySelectorAll("#oh-just-another-animated-image-sink").length).toBe(1);
    const sink = document.getElementById("oh-just-another-animated-image-sink")!;
    expect(sink.querySelectorAll("img").length).toBe(2);
  });

  it("marks GIFs animated and ships the raw bytes as animationData", async () => {
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], "anim.gif", { type: "image/gif" });
    const { editor, ctx } = makeContext();
    await imageFileDropHandler.handle(gif, ctx);

    const input = editor.insertImage.mock.calls[0]![0] as {
      animated: boolean;
      animationKind?: string;
      animationData?: ArrayBuffer;
    };
    expect(input.animated).toBe(true);
    expect(input.animationKind).toBe("gif");
    expect(input.animationData).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(input.animationData!)[0]).toBe(0x47);
  });

  it("detects GIFs by extension when the MIME type is empty", async () => {
    const gif = new File([new Uint8Array([1])], "anim.GIF", { type: "image/png" });
    const { editor, ctx } = makeContext();
    await imageFileDropHandler.handle(gif, ctx);

    const input = editor.insertImage.mock.calls[0]![0] as { animated: boolean };
    expect(input.animated).toBe(true);
  });

  it("hands the renderer an ImageBitmap for static images when createImageBitmap exists", async () => {
    const bitmap = { width: 100, height: 50 } as unknown as ImageBitmap;
    const createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const { editor, ctx } = makeContext();
    await imageFileDropHandler.handle(pngFile(), ctx);

    expect(createImageBitmap).toHaveBeenCalledOnce();
    const input = editor.insertImage.mock.calls[0]![0] as { image?: unknown };
    expect(input.image).toBe(bitmap);
  });

  it("falls back to the <img> handle when createImageBitmap rejects", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode failed")));
    const { editor, ctx } = makeContext();
    await imageFileDropHandler.handle(pngFile(), ctx);

    const input = editor.insertImage.mock.calls[0]![0] as { image?: unknown };
    expect(input.image).toBeInstanceOf(FakeImage);
  });

  it("keeps the <img> handle (not a bitmap) for GIFs", async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const gif = new File([new Uint8Array([1])], "anim.gif", { type: "image/gif" });
    const { editor, ctx } = makeContext();
    await imageFileDropHandler.handle(gif, ctx);

    expect(createImageBitmap).not.toHaveBeenCalled();
    const input = editor.insertImage.mock.calls[0]![0] as { image?: unknown };
    expect(input.image).toBeInstanceOf(FakeImage);
  });

  it("rejects when the image data cannot be decoded", async () => {
    // The object-URL contains the trigger string, so FakeImage fires onerror.
    vi.stubGlobal(
      "URL",
      Object.assign(Object.create(URL), { createObjectURL: () => "blob:decode-fail" }),
    );
    const { editor, ctx } = makeContext();
    await expect(imageFileDropHandler.handle(pngFile(), ctx)).rejects.toThrow(
      /Failed to decode image data URL/,
    );
    expect(editor.insertImage).not.toHaveBeenCalled();
  });

  it("rejects when Image() is not available in the environment", async () => {
    vi.stubGlobal("Image", undefined);
    const { ctx } = makeContext();
    await expect(imageFileDropHandler.handle(pngFile(), ctx)).rejects.toThrow(
      /Image\(\) is not available/,
    );
  });
});

describe("videoFileDropHandler", () => {
  const mp4File = (): File =>
    new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });

  /**
   * jsdom never fires loadedmetadata and its `play()` is unimplemented,
   * so the created <video> is captured via a createElement spy and its
   * metadata callback is driven by hand.
   */
  const trapVideo = (dims: {
    width: number;
    height: number;
  }): { played: () => boolean; element: () => HTMLVideoElement | null } => {
    let video: HTMLVideoElement | null = null;
    let played = false;
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- binding the runtime method; the deprecated string overload is irrelevant here
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = original(tag);
      if (tag === "video") {
        video = el as HTMLVideoElement;
        Object.defineProperty(video, "videoWidth", { get: () => dims.width });
        Object.defineProperty(video, "videoHeight", { get: () => dims.height });
        video.play = () => {
          played = true;
          return Promise.resolve();
        };
        // Fire metadata once the handler has assigned its listener.
        queueMicrotask(function poll() {
          if (video!.onloadedmetadata) video!.onloadedmetadata(new Event("loadedmetadata"));
          else queueMicrotask(poll);
        });
      }
      return el;
    });
    return { played: () => played, element: () => video };
  };

  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      Object.assign(Object.create(URL), { createObjectURL: () => "blob:video-url" }),
    );
  });

  it("accepts video files and rejects images", () => {
    expect(videoFileDropHandler.accept(mp4File())).toBe(true);
    expect(videoFileDropHandler.accept(pngFile())).toBe(false);
    expect(videoFileDropHandler.id).toBe("video");
  });

  it("inserts an animated element sized from the video metadata, centered on the drop point", async () => {
    const trap = trapVideo({ width: 320, height: 240 });
    const { editor, ctx } = makeContext();
    await videoFileDropHandler.handle(mp4File(), ctx);

    expect(editor.insertImage).toHaveBeenCalledOnce();
    const input = editor.insertImage.mock.calls[0]![0] as {
      src: string;
      width: number;
      height: number;
      position: { x: number; y: number };
      animated: boolean;
      image: unknown;
    };
    expect(input.src).toBe("blob:video-url");
    expect(input.width).toBe(320);
    expect(input.height).toBe(240);
    expect(input.position).toEqual({ x: 200 - 160, y: 100 - 120 });
    expect(input.animated).toBe(true);
    expect(input.image).toBe(trap.element());
    expect(trap.played()).toBe(true);
  });

  it("downscales oversized videos to DEFAULT_IMAGE_MAX_EDGE_PX", async () => {
    trapVideo({ width: 1920, height: 1080 });
    const { editor, ctx } = makeContext();
    await videoFileDropHandler.handle(mp4File(), ctx);

    const input = editor.insertImage.mock.calls[0]![0] as { width: number; height: number };
    expect(input.width).toBe(DEFAULT_IMAGE_MAX_EDGE_PX);
    expect(input.height).toBe(Math.round(1080 * (DEFAULT_IMAGE_MAX_EDGE_PX / 1920)));
  });

  it("falls back to 480x270 when the metadata reports zero dimensions", async () => {
    trapVideo({ width: 0, height: 0 });
    const { editor, ctx } = makeContext();
    await videoFileDropHandler.handle(mp4File(), ctx);

    const input = editor.insertImage.mock.calls[0]![0] as { width: number; height: number };
    expect(input.width).toBe(480);
    expect(input.height).toBe(270);
  });

  it("parks the <video> element in the hidden sink, muted and looping", async () => {
    const trap = trapVideo({ width: 320, height: 240 });
    const { ctx } = makeContext();
    await videoFileDropHandler.handle(mp4File(), ctx);

    const video = trap.element()!;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.autoplay).toBe(true);
    const sink = document.getElementById("oh-just-another-animated-image-sink")!;
    expect(sink.contains(video)).toBe(true);
  });
});
