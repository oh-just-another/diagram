import { describe, expect, it, vi } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { DEFAULT_LOD } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";
import {
  INITIAL_FRAME_STATS,
  recordFrameCost,
  probeGapMedian,
  recordFrameGap,
  recordRefreshProbe,
  snapToRefreshRate,
} from "../src/editor/frame-stats.js";
import { FRAME_COST_EMA_ALPHA } from "../src/constants.js";

describe("frame stats (pure)", () => {
  it("gap EMA tracks the achieved frame time and ignores pauses", () => {
    const a = recordFrameGap(INITIAL_FRAME_STATS, 100, 250);
    expect(a.gapMs).toBe(100);
    expect(a.lastGapMs).toBe(100);
    const b = recordFrameGap(a, 50, 250);
    expect(b.gapMs).toBeCloseTo(100 * (1 - FRAME_COST_EMA_ALPHA) + 50 * FRAME_COST_EMA_ALPHA);
    expect(recordFrameGap(b, 5000, 250)).toBe(b);
    expect(recordFrameGap(b, 0, 250)).toBe(b);
  });

  it("first frame seeds the EMA, later frames blend by FRAME_COST_EMA_ALPHA", () => {
    const a = recordFrameCost(INITIAL_FRAME_STATS, 10);
    expect(a).toMatchObject({ lastMs: 10, emaMs: 10, frames: 1 });
    const b = recordFrameCost(a, 20);
    expect(b.lastMs).toBe(20);
    expect(b.emaMs).toBeCloseTo(10 * (1 - FRAME_COST_EMA_ALPHA) + 20 * FRAME_COST_EMA_ALPHA);
    expect(b.frames).toBe(2);
  });

  it("refresh probe: median of the gaps, snapped to a known rate", () => {
    // Jittery 144 Hz stamps (6.94 ms ± 1.5).
    const gaps = [6.9, 8.3, 6.3, 7.5, 6.4, 7.1, 8.4, 6.2, 7.0, 6.8, 7.2];
    const stamps = gaps.reduce<number[]>((acc, g) => [...acc, (acc.at(-1) ?? 0) + g], [0]);
    const median = probeGapMedian(stamps);
    expect(median).not.toBeNull();
    expect(Math.round(1000 / recordRefreshProbe(INITIAL_FRAME_STATS, median!).intervalMs)).toBe(
      144,
    );
    expect(Math.round(1000 / snapToRefreshRate(16.9))).toBe(60);
    expect(Math.round(1000 / snapToRefreshRate(1000 / 118))).toBe(120);
    expect(probeGapMedian([1])).toBeNull();
    expect(recordRefreshProbe(INITIAL_FRAME_STATS, 0)).toBe(INITIAL_FRAME_STATS);
  });
});

const rect: Element = {
  id: elementId("r"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 80,
  height: 60,
};

const noopTarget = new Proxy(
  { measureText: () => ({ width: 0 }), size: { width: 400, height: 400 } } as Record<
    string,
    unknown
  >,
  { get: (o, k: string) => (k in o ? o[k] : () => undefined) },
) as never;
const host = () =>
  ({
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    style: { cursor: "" },
  }) as never;
const makeEditor = () =>
  new Editor({
    host: host(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: addElement(emptyScene(), rect).scene,
  });

describe("Editor frame stats and render LOD", () => {
  it("every painted frame updates frameStats and emits `frame`", () => {
    const e = makeEditor();
    const seen: number[] = [];
    e.on("frame", (s) => seen.push(s.frames));
    const before = e.frameStats.frames;
    e.forceRender();
    e.forceRender();
    expect(e.frameStats.frames).toBe(before + 2);
    expect(e.frameStats.lastMs).toBeGreaterThanOrEqual(0);
    expect(e.frameStats.gapMs).toBeGreaterThanOrEqual(0);
    expect(seen).toEqual([before + 1, before + 2]);
  });

  it("renderLod defaults to DEFAULT_LOD; setting it repaints with the new thresholds", () => {
    const e = makeEditor();
    expect(e.renderLod).toBe(DEFAULT_LOD);
    const snapshots = vi.spyOn(
      e as unknown as { buildRenderSnapshot: () => { lod: unknown } },
      "buildRenderSnapshot",
    );
    const lod = { ...DEFAULT_LOD, minTextScreenPx: 14 };
    const before = e.frameStats.frames;
    e.setRenderLod(lod);
    // No rAF in this environment → the scheduled render ran synchronously
    // with the new thresholds in the snapshot.
    expect(e.frameStats.frames).toBe(before + 1);
    expect(snapshots.mock.results.at(-1)?.value.lod).toBe(lod);
    // Same object → no-op, no extra frame.
    e.setRenderLod(lod);
    expect(e.frameStats.frames).toBe(before + 1);
  });

  it("the spatial index survives viewport-only scene changes", () => {
    const e = makeEditor();
    const first = e.ensureSpatialIndex();
    e.panBy({ x: 10, y: 0 });
    expect(e.ensureSpatialIndex()).toBe(first);
    e.setZoom(2);
    expect(e.ensureSpatialIndex()).toBe(first);
    // Element changes do rebuild it.
    e.setSelection([rect.id]);
    e.updateStyle([rect.id], { fill: "#123" });
    expect(e.ensureSpatialIndex()).not.toBe(first);
  });
});
