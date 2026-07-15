import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LruCache } from "@oh-just-another/renderer-core";
import { RecordingTarget, type RenderCommand } from "../src/recording-target";
import { packReplayFrame, replayPackedFrame } from "../src/replay-codec";
import { OFFSCREEN_IMAGE_CACHE_CAP } from "../src/constants";

/**
 * Round-trip tests for the packed replay codec: record a frame, pack it,
 * replay the packed form onto a fresh RecordingTarget, and compare the
 * re-recorded command stream to the original. `defineImage` commands do
 * not travel in the numeric stream (side bitmap array), so they are
 * filtered from both sides and asserted separately; `resize` is a replay
 * no-op (the worker owns the canvas size), so it is filtered too — its
 * packing is still exercised because commands after it would decode as
 * garbage if its args were misread.
 */

/** jsdom has no ImageBitmap — a branded stub satisfies the instanceof checks. */
class FakeImageBitmap {
  readonly _brand = "bitmap";
}

beforeEach(() => {
  (globalThis as { ImageBitmap?: unknown }).ImageBitmap = FakeImageBitmap;
});
afterEach(() => {
  delete (globalThis as { ImageBitmap?: unknown }).ImageBitmap;
});

const bmpA = new FakeImageBitmap() as unknown as ImageBitmap;
const bmpB = new FakeImageBitmap() as unknown as ImageBitmap;

/** Record one frame that hits every RenderCommand variant and every enum value. */
const recordEveryVariant = (t: RecordingTarget): void => {
  // Style setters — nullable colors, both null and string.
  t.setFill("#1a73e8");
  t.setFill(null);
  t.setStroke("#333333");
  t.setStroke(null);
  t.setStrokeWidth(2.5);
  t.setOpacity(0.75);
  for (const cap of ["butt", "round", "square"] as const) t.setLineCap(cap);
  for (const join of ["miter", "round", "bevel"] as const) t.setLineJoin(join);
  t.setDashArray([4, 2, 1.5]);
  t.setDashArray(null);
  // setFont: no options / weight only / style only / both / empty options.
  t.setFont("Inter", 14);
  t.setFont("Inter", 14, { weight: "bold" });
  t.setFont("Georgia", 12, { style: "italic" });
  t.setFont("Menlo", 11, { weight: "normal", style: "normal" });
  t.setFont("Arial", 10, {});
  for (const align of ["left", "center", "right"] as const) t.setTextAlign(align);
  for (const baseline of ["top", "middle", "bottom"] as const) t.setTextBaseline(baseline);
  // State / transforms.
  t.save();
  t.translate(10, -20);
  t.rotate(Math.PI / 3);
  t.scale(2, 0.5);
  t.setTransform({ a: 1, b: 0.1, c: -0.1, d: 1, e: 12.5, f: -7.25 });
  t.resetTransform();
  t.restore();
  // Paths.
  t.beginPath();
  t.moveTo(0, 0);
  t.lineTo(5.5, 6.25);
  t.quadraticCurveTo(1, 2, 3, 4);
  t.bezierCurveTo(1, 2, 3, 4, 5, 6);
  t.rect(10, 20, 30, 40);
  t.ellipse(50, 60, 7, 8);
  t.closePath();
  t.fill();
  t.fill("nonzero");
  t.fill("evenodd");
  t.stroke();
  // Text — with and without maxWidth.
  t.fillText("hello", 1, 2);
  t.fillText("hello", 3, 4, 120);
  // Clear / dirty / resize (resize lands mid-stream so a decode drift
  // would corrupt everything after it).
  t.clear();
  t.clear({ x: 1, y: 2, width: 3, height: 4 });
  t.markDirty({ x: -1, y: -2, width: 10, height: 20 });
  t.resize(200, 150);
  // Images: first draws intern (defineImage + drawImage), repeat draws are
  // id-only; the `dynamic` flag is not part of the recorded command shape.
  t.drawImage(bmpA, 1, 2, 3, 4);
  t.drawImage(bmpA, 5, 6, 7, 8, true);
  t.drawImage(bmpB, 9, 10, 11, 12);
};

/** Commands that travel through the numeric stream (comparison baseline). */
const streamed = (cmds: readonly RenderCommand[]): RenderCommand[] =>
  cmds.filter((c) => c.k !== "defineImage" && c.k !== "resize");

describe("replay codec round-trip", () => {
  it("re-records the exact command stream through pack → replayPackedFrame", () => {
    const source = new RecordingTarget(100, 80);
    recordEveryVariant(source);
    const original = source.flush();

    const { buffer, strings, bitmaps } = packReplayFrame(original);

    // defineImage payloads travel in the side array: ids + bitmap identity.
    expect(bitmaps).toEqual([
      { id: 0, bitmap: bmpA },
      { id: 1, bitmap: bmpB },
    ]);
    expect(bitmaps[0]?.bitmap).toBe(bmpA);
    expect(bitmaps[1]?.bitmap).toBe(bmpB);

    // Register side bitmaps first — as the worker does — then replay.
    const images = new LruCache<number, ImageBitmap>(OFFSCREEN_IMAGE_CACHE_CAP);
    for (const { id, bitmap } of bitmaps) images.set(id, bitmap);
    const sink = new RecordingTarget(100, 80);
    replayPackedFrame(sink, buffer, strings, images);

    // The sink re-interns the same bitmaps in the same order, so even its
    // re-emitted defineImage ids match; filter them (and the replay-no-op
    // resize) from both sides to compare only the streamed commands.
    expect(streamed(sink.flush())).toEqual(streamed(original));
  });

  it("skips a drawImage whose id misses the image cache instead of throwing", () => {
    const source = new RecordingTarget(10, 10);
    source.drawImage(bmpA, 1, 2, 3, 4);
    source.rect(0, 0, 5, 5);
    const { buffer, strings } = packReplayFrame(source.flush());

    // Empty cache: side bitmaps deliberately not registered.
    const sink = new RecordingTarget(10, 10);
    replayPackedFrame(sink, buffer, strings, new LruCache(OFFSCREEN_IMAGE_CACHE_CAP));
    expect(sink.flush()).toEqual([{ k: "rect", x: 0, y: 0, w: 5, h: 5 }]);
  });
});

describe("replay codec string table", () => {
  it("dedups repeated strings: 100 same-color fills → 1 table entry", () => {
    const t = new RecordingTarget(10, 10);
    for (let i = 0; i < 100; i++) {
      t.setFill("#1a73e8");
      t.rect(i, 0, 1, 1);
      t.fill();
    }
    const { strings } = packReplayFrame(t.flush());
    expect(strings).toEqual(["#1a73e8"]);
  });

  it("indexes distinct strings once each, shared across command kinds", () => {
    const t = new RecordingTarget(10, 10);
    t.setFill("#111111");
    t.setStroke("#111111");
    t.setFont("Inter", 12);
    t.fillText("Inter", 0, 0); // same string as the font family → shared entry
    t.fillText("label", 0, 10);
    const { strings } = packReplayFrame(t.flush());
    expect(strings).toEqual(["#111111", "Inter", "label"]);
  });
});
