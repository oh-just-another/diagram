/**
 * Built-in GIF adapter: rejects non-buffers, decodes lazily (null until the
 * frames are ready), then answers frames by timestamp and the total loop
 * length. jsdom has no OffscreenCanvas / ImageData / createImageBitmap —
 * minimal stand-ins record what the compositor does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnimationAdapter } from "@oh-just-another/renderer-core";
import { DEFAULT_FRAME_DELAY_MS } from "../src/constants";
import { installGifAnimationAdapter } from "../src/gif-animation";

// 1×1 transparent GIF, one frame, zero delay.
const GIF_1PX = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
).buffer;

const ctx2d = {
  putImageData: vi.fn(),
  drawImage: vi.fn(),
  clearRect: vi.fn(),
};
class FakeOffscreen {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(): typeof ctx2d {
    return ctx2d;
  }
}
class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

beforeEach(() => {
  Object.assign(globalThis, {
    OffscreenCanvas: FakeOffscreen,
    ImageData: FakeImageData,
    createImageBitmap: vi.fn(async (c: FakeOffscreen) => ({ width: c.width, height: c.height })),
  });
});

afterEach(() => {
  for (const k of ["OffscreenCanvas", "ImageData", "createImageBitmap"]) {
    Reflect.deleteProperty(globalThis, k);
  }
});

describe("gif animation adapter", () => {
  it("installs once and rejects anything but a non-empty ArrayBuffer", () => {
    installGifAnimationAdapter();
    installGifAnimationAdapter();
    const adapter = getAnimationAdapter("gif");
    expect(adapter?.kind).toBe("gif");
    expect(adapter?.getFrameAt("nope" as never, 0)).toBeNull();
    expect(adapter?.getFrameAt(new ArrayBuffer(0), 0)).toBeNull();
    expect(adapter?.totalDurationMs?.(new ArrayBuffer(0))).toBe(0);
  });

  it("decodes on first sight and then serves the frame by timestamp", async () => {
    installGifAnimationAdapter();
    const adapter = getAnimationAdapter("gif")!;
    expect(adapter.getFrameAt(GIF_1PX, 0)).toBeNull();
    await vi.waitFor(() => {
      expect(adapter.getFrameAt(GIF_1PX, 0)).not.toBeNull();
    });
    expect(adapter.totalDurationMs?.(GIF_1PX)).toBe(DEFAULT_FRAME_DELAY_MS);
    const frame = adapter.getFrameAt(GIF_1PX, 0) as { width: number };
    expect(frame.width).toBe(1);
    // Past the loop end wraps around; the last frame answers the tail.
    expect(adapter.getFrameAt(GIF_1PX, DEFAULT_FRAME_DELAY_MS * 3 + 1)).toBe(frame);
    expect(ctx2d.putImageData).toHaveBeenCalled();
  });
});
