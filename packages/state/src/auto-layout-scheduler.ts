import type { ElementId } from "@oh-just-another/types";
import {
  apply,
  getAutoLayoutSpec,
  getDropZoneWorld,
  getElement,
  getElementWorldBounds,
  runAutoLayout,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";

/**
 * Microtask-coalesced re-runner for shapes carrying
 * `metadata.autoLayout`. The editor calls `schedule()` from `notify()`;
 * the check walks every auto-layout parent, compares its children-set
 * fingerprint against the previous run, and re-runs the layout when the
 * set changed.
 *
 * Pure position edits inside an existing children set are ignored
 * (fingerprint is sorted-ids only), so a manual nudge of a child
 * isn't snapped back. Add / remove / reparent does trigger.
 */
export class AutoLayoutScheduler {
  private pending = false;
  private readonly signatures = new Map<ElementId, string>();

  constructor(private readonly opts: AutoLayoutSchedulerOptions) {}

  /** Queue a check for the next microtask. Coalesces bursts. */
  schedule(): void {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.runCheck();
    });
  }

  /**
   * Recompute and store the signature for a parent, used after the
   * editor's public `runLayout(parentId)` to prevent the next
   * scheduled check from firing a redundant second run.
   */
  resetSignature(parentId: ElementId): void {
    this.signatures.set(parentId, this.signatureFor(parentId));
  }

  /** Run the actual check + relayout immediately. Used by tests. */
  runCheck(): void {
    const scene = this.opts.getScene();
    let mutated = false;
    for (const parent of scene.elements.values()) {
      if (!getAutoLayoutSpec(parent)) continue;
      const sig = this.signatureFor(parent.id);
      if (this.signatures.get(parent.id) === sig) continue;
      this.signatures.set(parent.id, sig);
      const patch = runAutoLayout(this.opts.getScene(), parent.id);
      if (!patch) continue;
      this.opts.applyPatch(patch);
      // Grow container to fit children after they've been re-laid out.
      // Per-child idempotent: `growContainer` is a no-op when the child
      // already fits the drop-zone.
      const post = this.opts.getScene();
      for (const s of post.elements.values()) {
        if (s.parentId === parent.id) this.opts.growContainer(parent.id, s.id);
      }
      mutated = true;
    }
    if (mutated) this.opts.onMutated();
  }

  private signatureFor(parentId: ElementId): string {
    const scene = this.opts.getScene();
    const parent = getElement(scene, parentId);
    const children = [...scene.elements.values()].filter((s) => s.parentId === parentId);
    // Wrap containers reflow on drop-zone geometry (origin + width) AND
    // child-size changes (not just child add/remove): fold the drop-zone
    // top-left + width + each child's size into the signature so resizing the
    // container, MOVING it, or resizing a child re-anchors children at the
    // (top-left-pinned) drop-zone origin. Other kinds keep the ids-only
    // fingerprint (a manual position nudge isn't snapped back).
    if (parent && getAutoLayoutSpec(parent)?.kind === "wrap") {
      const dz = getDropZoneWorld(parent);
      const origin = dz ? `${Math.round(dz.x)},${Math.round(dz.y)}` : "0,0";
      const innerW = dz ? Math.round(dz.width) : 0;
      const parts = children
        .map((s) => {
          const b = getElementWorldBounds(s);
          return `${s.id}:${Math.round(b.width)}x${Math.round(b.height)}`;
        })
        .sort();
      return `o${origin}|w${innerW}|${parts.join(",")}`;
    }
    const ids = children.map((s) => s.id);
    ids.sort();
    return ids.join(",");
  }
}

export interface AutoLayoutSchedulerOptions {
  readonly getScene: () => Scene;
  /**
   * Apply the layout patch — implementation knows whether to join
   * a running gesture transaction or push straight to history.
   */
  readonly applyPatch: (patch: Patch) => void;
  /** Editor-side hook to grow the container after the relayout. */
  readonly growContainer: (parentId: ElementId, childId: ElementId) => void;
  /**
   * Called once at the end of a check that produced at least one
   * mutation — editor renders + fires listeners (intentionally NOT
   * `notify()` because that would re-schedule the check and risk
   * a microtask loop).
   */
  readonly onMutated: () => void;
}

export type { Patch, Scene };
export { apply };
