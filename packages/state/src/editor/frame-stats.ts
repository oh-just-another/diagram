import { FRAME_COST_EMA_ALPHA, FRAME_REFRESH_RATES_HZ } from "../constants.js";

/**
 * Live render-cost statistics, updated after every painted frame. Read via
 * {@link Editor.frameStats} or subscribe to the `frame` event. `emaMs` is
 * the render pass alone; `gapMs` is what the user experiences as frame
 * time; `intervalMs` is the display's refresh interval from the idle probe
 * (≈16.7 on 60 Hz, ≈6.9 on 144 Hz).
 */
export interface FrameStats {
  /** Cost of the last painted frame, ms (main + overlay pass). */
  readonly lastMs: number;
  /** Exponential moving average of the frame cost, ms. */
  readonly emaMs: number;
  /**
   * Display interval, ms, from the idle refresh probe, snapped to the
   * nearest known refresh rate (`FRAME_REFRESH_RATES_HZ`); `0` until the
   * first probe completes.
   */
  readonly intervalMs: number;
  /**
   * EMA of the wall-clock gap between consecutive painted frames, ms — the
   * achieved frame time (`1000 / gapMs` = fps), which includes everything
   * outside the render pass (input handling, React chrome, layout). `0`
   * until two frames have been painted.
   */
  readonly gapMs: number;
  /** Wall-clock gap before the last paint, ms (`0` for the first frame). */
  readonly lastGapMs: number;
  /** Frames painted since the editor was created. */
  readonly frames: number;
}

export const INITIAL_FRAME_STATS: FrameStats = {
  lastMs: 0,
  emaMs: 0,
  intervalMs: 0,
  gapMs: 0,
  lastGapMs: 0,
  frames: 0,
};

/** Fold one painted frame's cost into the stats (pure). */
export const recordFrameCost = (stats: FrameStats, costMs: number): FrameStats => ({
  ...stats,
  lastMs: costMs,
  emaMs:
    stats.frames === 0
      ? costMs
      : stats.emaMs * (1 - FRAME_COST_EMA_ALPHA) + costMs * FRAME_COST_EMA_ALPHA,
  frames: stats.frames + 1,
});

/** Snap a measured interval to the nearest known refresh rate, ms. */
export const snapToRefreshRate = (intervalMs: number): number => {
  const hz = 1000 / intervalMs;
  let best = FRAME_REFRESH_RATES_HZ[0] ?? hz;
  for (const rate of FRAME_REFRESH_RATES_HZ) {
    if (Math.abs(rate - hz) < Math.abs(best - hz)) best = rate;
  }
  return 1000 / best;
};

/** Median of the gaps between consecutive probe timestamps; `null` for < 2 stamps. */
export const probeGapMedian = (timestamps: readonly number[]): number | null => {
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const a = timestamps[i - 1];
    const b = timestamps[i];
    if (a !== undefined && b !== undefined) gaps.push(b - a);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? null;
};

/** Record a completed refresh probe (pure): the display interval becomes the snapped median gap. */
export const recordRefreshProbe = (stats: FrameStats, medianGapMs: number): FrameStats =>
  !(medianGapMs > 0) ? stats : { ...stats, intervalMs: snapToRefreshRate(medianGapMs) };

/**
 * Fold the gap since the previous paint into the stats (pure). Gaps beyond
 * `maxMs` (idle, hidden tab) are dropped — they are pauses, not frame time.
 */
export const recordFrameGap = (stats: FrameStats, gapMs: number, maxMs: number): FrameStats => {
  if (!(gapMs > 0) || gapMs > maxMs) return stats;
  return {
    ...stats,
    lastGapMs: gapMs,
    gapMs:
      stats.gapMs === 0
        ? gapMs
        : stats.gapMs * (1 - FRAME_COST_EMA_ALPHA) + gapMs * FRAME_COST_EMA_ALPHA,
  };
};
