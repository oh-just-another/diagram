import { describe, expect, it, vi } from "vitest";
import {
  FileDropRegistry,
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  isVideoFile,
  isImageFile,
  isSceneJsonFile,
  readFileAsDataURL,
  readFileAsText,
} from "../src/file-drop.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeFile = (name: string, type = ""): File =>
  new File(["content"], name, { type });

// ---------------------------------------------------------------------------
// isVideoFile
// ---------------------------------------------------------------------------

describe("isVideoFile", () => {
  it("returns true for video/* MIME types", () => {
    expect(isVideoFile(makeFile("clip.mp4", "video/mp4"))).toBe(true);
    expect(isVideoFile(makeFile("clip.webm", "video/webm"))).toBe(true);
    expect(isVideoFile(makeFile("clip.ogg", "video/ogg"))).toBe(true);
    expect(isVideoFile(makeFile("clip.mov", "video/quicktime"))).toBe(true);
  });

  it("returns true by extension when MIME is absent", () => {
    expect(isVideoFile(makeFile("clip.mp4", ""))).toBe(true);
    expect(isVideoFile(makeFile("clip.webm", ""))).toBe(true);
    expect(isVideoFile(makeFile("clip.ogv", ""))).toBe(true);
    expect(isVideoFile(makeFile("clip.mov", ""))).toBe(true);
  });

  it("returns false for non-video files", () => {
    expect(isVideoFile(makeFile("photo.png", "image/png"))).toBe(false);
    expect(isVideoFile(makeFile("doc.json", "application/json"))).toBe(false);
    expect(isVideoFile(makeFile("unknown.bin", ""))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isImageFile
// ---------------------------------------------------------------------------

describe("isImageFile", () => {
  it("returns true for all IMAGE_MIME_TYPES", () => {
    for (const mime of IMAGE_MIME_TYPES) {
      expect(isImageFile(makeFile("img", mime))).toBe(true);
    }
  });

  it("returns true by extension when MIME is absent", () => {
    const extensions = ["png", "jpg", "jpeg", "jfif", "svg", "gif", "webp", "bmp", "ico", "avif"];
    for (const ext of extensions) {
      expect(isImageFile(makeFile(`image.${ext}`, ""))).toBe(true);
    }
  });

  it("returns false when MIME and extension are both non-image", () => {
    expect(isImageFile(makeFile("clip.mp4", "video/mp4"))).toBe(false);
    expect(isImageFile(makeFile("doc.json", "application/json"))).toBe(false);
    expect(isImageFile(makeFile("file.bin", ""))).toBe(false);
  });

  it("returns false when the file has no extension and no MIME", () => {
    expect(isImageFile(makeFile("noextension", ""))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSceneJsonFile
// ---------------------------------------------------------------------------

describe("isSceneJsonFile", () => {
  it("returns true for application/json MIME", () => {
    expect(isSceneJsonFile(makeFile("scene.json", "application/json"))).toBe(true);
  });

  it("returns true for .json extension regardless of MIME", () => {
    expect(isSceneJsonFile(makeFile("scene.json", ""))).toBe(true);
    expect(isSceneJsonFile(makeFile("SCENE.JSON", ""))).toBe(true);
  });

  it("returns false for non-JSON files", () => {
    expect(isSceneJsonFile(makeFile("image.png", "image/png"))).toBe(false);
    expect(isSceneJsonFile(makeFile("video.mp4", "video/mp4"))).toBe(false);
    expect(isSceneJsonFile(makeFile("data.csv", "text/csv"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// IMAGE_MIME_TYPES / VIDEO_MIME_TYPES constants
// ---------------------------------------------------------------------------

describe("IMAGE_MIME_TYPES", () => {
  it("is a non-empty readonly array of strings", () => {
    expect(IMAGE_MIME_TYPES.length).toBeGreaterThan(0);
    expect(IMAGE_MIME_TYPES.every((m) => typeof m === "string")).toBe(true);
  });

  it("includes common image formats", () => {
    expect(IMAGE_MIME_TYPES).toContain("image/png");
    expect(IMAGE_MIME_TYPES).toContain("image/jpeg");
    expect(IMAGE_MIME_TYPES).toContain("image/gif");
    expect(IMAGE_MIME_TYPES).toContain("image/svg+xml");
  });
});

describe("VIDEO_MIME_TYPES", () => {
  it("is a non-empty readonly array of strings", () => {
    expect(VIDEO_MIME_TYPES.length).toBeGreaterThan(0);
    expect(VIDEO_MIME_TYPES.every((m) => typeof m === "string")).toBe(true);
  });

  it("includes common video formats", () => {
    expect(VIDEO_MIME_TYPES).toContain("video/mp4");
    expect(VIDEO_MIME_TYPES).toContain("video/webm");
  });
});

// ---------------------------------------------------------------------------
// FileDropRegistry
// ---------------------------------------------------------------------------

describe("FileDropRegistry", () => {
  const makeHandler = (id: string, accepts = true) => ({
    id,
    accept: (_f: File) => accepts,
    handle: vi.fn((_f: File): Promise<void> => Promise.resolve()),
  });

  it("getAll() returns an empty list initially", () => {
    const reg = new FileDropRegistry();
    expect(reg.getAll()).toEqual([]);
  });

  it("register adds a handler and getAll() returns it", () => {
    const reg = new FileDropRegistry();
    const h = makeHandler("img");
    reg.register(h);
    expect(reg.getAll()).toHaveLength(1);
    expect(reg.getAll()[0]?.id).toBe("img");
  });

  it("registering the same id replaces the existing handler", () => {
    const reg = new FileDropRegistry();
    const h1 = makeHandler("img");
    const h2 = makeHandler("img");
    reg.register(h1);
    reg.register(h2);
    expect(reg.getAll()).toHaveLength(1);
    expect(reg.getAll()[0]).toBe(h2);
  });

  it("unregister removes the handler by id", () => {
    const reg = new FileDropRegistry();
    reg.register(makeHandler("a"));
    reg.register(makeHandler("b"));
    reg.unregister("a");
    expect(reg.getAll().map((h) => h.id)).toEqual(["b"]);
  });

  it("unregister on a missing id is a no-op", () => {
    const reg = new FileDropRegistry();
    reg.register(makeHandler("a"));
    expect(() => reg.unregister("ghost")).not.toThrow();
    expect(reg.getAll()).toHaveLength(1);
  });

  it("dispatch calls the first accepting handler and returns true", async () => {
    const reg = new FileDropRegistry();
    const h1 = makeHandler("h1", false);
    const h2 = makeHandler("h2", true);
    reg.register(h1);
    reg.register(h2);
    const file = makeFile("test.png", "image/png");
    const ctx = { editor: {} as never, worldPoint: { x: 0, y: 0 } };
    const result = await reg.dispatch(file, ctx);
    expect(result).toBe(true);
    expect(h2.handle).toHaveBeenCalledWith(file, ctx);
    expect(h1.handle).not.toHaveBeenCalled();
  });

  it("dispatch returns false when no handler accepts", async () => {
    const reg = new FileDropRegistry();
    reg.register(makeHandler("h1", false));
    const file = makeFile("test.xyz", "");
    const result = await reg.dispatch(file, { editor: {} as never, worldPoint: { x: 0, y: 0 } });
    expect(result).toBe(false);
  });

  it("dispatch stops at the first accepting handler (does not call subsequent)", async () => {
    const reg = new FileDropRegistry();
    const h1 = makeHandler("h1", true);
    const h2 = makeHandler("h2", true);
    reg.register(h1);
    reg.register(h2);
    await reg.dispatch(makeFile("f.png"), { editor: {} as never, worldPoint: { x: 0, y: 0 } });
    expect(h1.handle).toHaveBeenCalledTimes(1);
    expect(h2.handle).not.toHaveBeenCalled();
  });

  it("dispatch returns false for an empty registry", async () => {
    const reg = new FileDropRegistry();
    const result = await reg.dispatch(makeFile("f.png"), { editor: {} as never, worldPoint: { x: 0, y: 0 } });
    expect(result).toBe(false);
  });

  it("multiple handlers are called in registration order (first match wins)", async () => {
    const reg = new FileDropRegistry();
    const order: string[] = [];
    reg.register({ id: "a", accept: () => false, handle: () => { order.push("a"); } });
    reg.register({ id: "b", accept: () => true,  handle: () => { order.push("b"); } });
    reg.register({ id: "c", accept: () => true,  handle: () => { order.push("c"); } });
    await reg.dispatch(makeFile("f.png"), { editor: {} as never, worldPoint: { x: 0, y: 0 } });
    expect(order).toEqual(["b"]); // a rejected; b accepted; c not reached
  });
});

// ---------------------------------------------------------------------------
// readFileAsDataURL / readFileAsText — mocked FileReader (node env has none)
// ---------------------------------------------------------------------------

type GlobalWithFileReader = typeof globalThis & { FileReader?: unknown };

/** Install a minimal FileReader stub on globalThis for the duration of a test. */
const withFakeFileReader = (resultValue: string | null, triggerError = false) => {
  const g = globalThis as GlobalWithFileReader;
  const original = g.FileReader;
  const instance = {
    result: resultValue,
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    error: triggerError ? new Error("read error") : null,
    readAsDataURL: vi.fn(function (this: typeof instance) {
      if (triggerError) setTimeout(() => this.onerror?.(), 0);
      else setTimeout(() => this.onload?.(), 0);
    }),
    readAsText: vi.fn(function (this: typeof instance) {
      if (triggerError) setTimeout(() => this.onerror?.(), 0);
      else setTimeout(() => this.onload?.(), 0);
    }),
  };
  g.FileReader = vi.fn(() => instance);
  return {
    restore: () => {
      if (original === undefined) delete g.FileReader;
      else g.FileReader = original;
    },
    instance,
  };
};

describe("readFileAsDataURL", () => {
  it("resolves to a data URL string", async () => {
    const { restore } = withFakeFileReader("data:text/plain;base64,aGVsbG8=");
    const file = makeFile("test.txt", "text/plain");
    const url = await readFileAsDataURL(file);
    expect(url).toBe("data:text/plain;base64,aGVsbG8=");
    restore();
  });

  it("rejects when the FileReader errors", async () => {
    const { restore } = withFakeFileReader(null, true);
    const file = makeFile("bad.txt", "text/plain");
    await expect(readFileAsDataURL(file)).rejects.toBeInstanceOf(Error);
    restore();
  });
});

describe("readFileAsText", () => {
  it("resolves to the plain text content", async () => {
    const { restore } = withFakeFileReader("hello text");
    const file = makeFile("test.txt", "text/plain");
    const text = await readFileAsText(file);
    expect(text).toBe("hello text");
    restore();
  });

  it("resolves to an empty string for an empty result", async () => {
    const { restore } = withFakeFileReader("");
    const file = makeFile("empty.txt", "text/plain");
    const text = await readFileAsText(file);
    expect(text).toBe("");
    restore();
  });

  it("rejects when the FileReader errors", async () => {
    const { restore } = withFakeFileReader(null, true);
    const file = makeFile("bad.txt", "text/plain");
    await expect(readFileAsText(file)).rejects.toBeInstanceOf(Error);
    restore();
  });
});
