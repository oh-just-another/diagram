import type { LayerId } from "@oh-just-another/types";
import type { Scene } from "@oh-just-another/scene";
import { AUTO_COMPACT_THRESHOLD } from "./constants.js";

/**
 * Microtask-scheduled rebalancer for fractional `order` keys. When any
 * shape or edge's order string grows past AUTO_COMPACT_THRESHOLD, a
 * single compaction pass is scheduled per mutation burst so users never
 * see the long-key state.
 *
 * The scheduler keeps a `pending` flag to coalesce bursts into one
 * microtask; `runCheck()` is what the microtask invokes (and what tests
 * call directly when they want determinism).
 */
export class AutoCompactScheduler {
  private pending = false;
  private readonly getScene: () => Scene;
  private readonly compact: (layerId: LayerId) => void;

  constructor(opts: {
    readonly getScene: () => Scene;
    /** Caller-supplied compaction action — usually `editor.compactLayerZOrder(layerId, {recordHistory:false})`. */
    readonly compact: (layerId: LayerId) => void;
  }) {
    this.getScene = opts.getScene;
    this.compact = opts.compact;
  }

  /** Queue a check for the next microtask. Coalesces bursts. */
  schedule(): void {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.runCheck();
    });
  }

  /** Run the actual check + compact immediately. Used by tests. */
  runCheck(): void {
    const scene = this.getScene();
    const layersToCompact = new Set<LayerId>();
    for (const s of scene.elements.values()) {
      if (s.order.length > AUTO_COMPACT_THRESHOLD) layersToCompact.add(s.layerId);
    }
    for (const e of scene.links.values()) {
      if (e.order.length > AUTO_COMPACT_THRESHOLD) layersToCompact.add(e.layerId);
    }
    for (const lid of layersToCompact) this.compact(lid);
  }
}
