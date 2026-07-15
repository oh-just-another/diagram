/**
 * Offscreen backend: non-bitmap drawable sources (video frames, <img>,
 * canvases) are snapshotted into worker-ownable ImageBitmaps instead of being
 * silently skipped. Dynamic sources re-capture per draw under the same id
 * with a `gen` bump (so the frame signature changes and the surface reposts),
 * and the worker closes the replaced clone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LruCache } from "@oh-just-another/renderer-core";
import { RecordingTarget, replayCommands } from "../src/recording-target";

/** Fake bitmap produced by the scratch canvas / consumed by the worker. */
class FakeBitmap {
  readonly width = 8;
  readonly height = 8;
  closed = false;
  close(): void {
    this.closed = true;
  }
}

/** OffscreenCanvas stand-in whose transferToImageBitmap mints FakeBitmaps. */
class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(): unknown {
    return { clearRect: () => undefined, drawImage: () => undefined };
  }
  transferToImageBitmap(): FakeBitmap {
    return new FakeBitmap();
  }
}

/** Minimal HTMLVideoElement stand-in recognised by isDrawableImageSource. */
class FakeVideo {
  videoWidth = 16;
  videoHeight = 9;
  readyState = 2; // HAVE_CURRENT_DATA
}

const defineImages = (t: RecordingTarget) =>
  t.flush().filter((c) => c.k === "defineImage") as {
    k: "defineImage";
    id: number;
    bitmap: ImageBitmap;
    gen?: number;
  }[];

describe("RecordingTarget — video / element source capture", () => {
  beforeEach(() => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    vi.stubGlobal("ImageBitmap", FakeBitmap);
    vi.stubGlobal("HTMLVideoElement", FakeVideo);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a dynamic video draw captures a frame per draw under one id with a gen bump", () => {
    const t = new RecordingTarget(100, 100);
    const video = new FakeVideo();
    t.drawImage(video, 0, 0, 16, 9, true);
    const first = defineImages(t);
    expect(first).toHaveLength(1);

    t.drawImage(video, 0, 0, 16, 9, true);
    const second = defineImages(t);
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe(first[0]!.id); // same id — worker replaces
    expect(second[0]!.gen).not.toBe(first[0]!.gen); // signature must differ
    expect(second[0]!.bitmap).not.toBe(first[0]!.bitmap); // fresh frame
  });

  it("consecutive frames of a playing video produce different signatures (no skip)", () => {
    const t = new RecordingTarget(100, 100);
    const video = new FakeVideo();
    t.drawImage(video, 0, 0, 16, 9, true);
    t.flush();
    const sigA = t.lastSignature;
    t.drawImage(video, 0, 0, 16, 9, true);
    t.flush();
    expect(t.lastSignature).not.toBe(sigA);
  });

  it("a static element source is captured once and interned by identity", () => {
    const t = new RecordingTarget(100, 100);
    const video = new FakeVideo(); // any drawable element; dynamic=false
    t.drawImage(video, 0, 0, 16, 9, false);
    t.drawImage(video, 10, 10, 16, 9, false);
    const cmds = t.flush();
    expect(cmds.filter((c) => c.k === "defineImage")).toHaveLength(1);
    expect(cmds.filter((c) => c.k === "drawImage")).toHaveLength(2);
  });

  it("a video without pixels yet (readyState < 2) is skipped, not crashed", () => {
    const t = new RecordingTarget(100, 100);
    const video = new FakeVideo();
    video.readyState = 1;
    t.drawImage(video, 0, 0, 16, 9, true);
    expect(t.flush()).toHaveLength(0);
  });

  it("replay closes the replaced clone when an id is re-defined", () => {
    const t = new RecordingTarget(100, 100);
    const video = new FakeVideo();
    const images = new LruCache<number, ImageBitmap>(8);

    t.drawImage(video, 0, 0, 16, 9, true);
    const frame1 = defineImages(t)[0]!;
    replayCommands(noopTarget(), [frame1], images);

    t.drawImage(video, 0, 0, 16, 9, true);
    const frame2 = defineImages(t)[0]!;
    replayCommands(noopTarget(), [frame2], images);

    expect((frame1.bitmap as unknown as FakeBitmap).closed).toBe(true);
    expect((frame2.bitmap as unknown as FakeBitmap).closed).toBe(false);
  });
});

const noopTarget = () =>
  new Proxy({} as Record<string, unknown>, { get: () => () => undefined }) as never;
