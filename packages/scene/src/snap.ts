import type { Vec2 } from "@oh-just-another/types";
import type { AnchorRef } from "./edge.js";
import { findNearestOutlinePoint } from "./outline.js";
import type { Scene } from "./scene.js";
import type { ShapeBase } from "./shape.js";
import { findNearestAnchor } from "./anchors.js";

/**
 * One snap target a contributor can offer for a probe point. `snapped` is
 * the world-space position the probe should jump to; `kind` and `metadata`
 * help downstream consumers (renderers, edge-endpoint builders) decide what
 * to do with the snap.
 */
export interface SnapCandidate {
  readonly snapped: Vec2;
  /** Squared distance from probe to `snapped`. Smaller wins. */
  readonly distance: number;
  /** What kind of snap this is. Hosts use it to decide downstream. */
  readonly kind: "grid" | "anchor" | "outline" | "guideline";
  /** Optional payload — anchor ref, outline ratio, alignment line, etc. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Per-call context handed to every contributor. Includes the probe point,
 * the active scene, an optional set of shape ids to exclude from snap (e.g.
 * the shape currently being dragged), and the snap threshold in world units.
 */
export interface SnapContext {
  readonly scene: Scene;
  readonly probe: Vec2;
  readonly threshold: number;
  readonly excludeShapeIds?: ReadonlySet<string>;
  /**
   * What kind of gesture is asking for snap. Contributors can filter
   * themselves out by gesture (e.g. anchor snap only applies during edge
   * draw, not when dragging a shape).
   */
  readonly gesture: "draw-edge" | "edit-edge-endpoint" | "move-shape" | "draw-shape";
}

/**
 * A snap source. Plugins implement this to add a new snap rule (e.g. snap
 * to ruler lines, page margins, ...). Built-ins: grid, anchor, outline,
 * guideline.
 *
 * Contributors return zero or more candidates. The engine keeps the best
 * (closest within threshold) per `kind` and exposes them all so renderers
 * can paint guides for each.
 */
export interface SnapContributor {
  readonly id: string;
  contribute(ctx: SnapContext): readonly SnapCandidate[];
}

/**
 * Combines contributors. Stateless — instance is a thin container.
 *
 * ```ts
 * const engine = new SnapEngine([gridSnapper, anchorSnapper, outlineSnapper]);
 * const result = engine.snap({ scene, probe, threshold: 8, gesture: "draw-edge" });
 * if (result.best) editor.useSnap(result.best);
 * ```
 */
export class SnapEngine {
  constructor(private readonly contributors: readonly SnapContributor[]) {}

  /**
   * Run every contributor, collect their candidates within `threshold`,
   * and return them sorted by distance. `best` is the closest overall.
   */
  snap(ctx: SnapContext): {
    readonly best: SnapCandidate | null;
    readonly all: readonly SnapCandidate[];
  } {
    const candidates: SnapCandidate[] = [];
    for (const c of this.contributors) {
      for (const cand of c.contribute(ctx)) {
        if (cand.distance <= ctx.threshold * ctx.threshold) candidates.push(cand);
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return { best: candidates[0] ?? null, all: candidates };
  }
}

// --- Built-in contributors ---

/**
 * Snap the probe to the nearest grid intersection. No-op when the scene
 * viewport has no `gridSize`.
 */
export const gridSnapper: SnapContributor = {
  id: "grid",
  contribute(ctx) {
    const size = ctx.scene.viewport.gridSize;
    if (!size || size <= 0) return [];
    const snapped: Vec2 = {
      x: Math.round(ctx.probe.x / size) * size,
      y: Math.round(ctx.probe.y / size) * size,
    };
    const dx = snapped.x - ctx.probe.x;
    const dy = snapped.y - ctx.probe.y;
    return [{ snapped, distance: dx * dx + dy * dy, kind: "grid" }];
  },
};

/**
 * Snap edge endpoints to the nearest port on the shape under the probe.
 * Only contributes for edge-related gestures.
 */
export const anchorSnapper: SnapContributor = {
  id: "anchor",
  contribute(ctx) {
    if (ctx.gesture !== "draw-edge" && ctx.gesture !== "edit-edge-endpoint") return [];
    const out: SnapCandidate[] = [];
    for (const shape of ctx.scene.shapes.values()) {
      if (ctx.excludeShapeIds?.has(shape.id)) continue;
      // Cheap reject: skip shapes whose AABB is far from the probe.
      if (!isProbeNearShape(shape, ctx.probe, ctx.threshold)) continue;
      const nearest = findNearestAnchor(shape, ctx.probe);
      const dx = nearest.world.x - ctx.probe.x;
      const dy = nearest.world.y - ctx.probe.y;
      out.push({
        snapped: nearest.world,
        distance: dx * dx + dy * dy,
        kind: "anchor",
        metadata: { shapeId: shape.id, ref: nearest.ref satisfies AnchorRef },
      });
    }
    return out;
  },
};

/**
 * Snap edge endpoints to the nearest point on a shape's outline. Useful
 * as a fallback when the user wants the connector "on this edge" rather
 * than at one of the 9 named ports. Combines well with `anchorSnapper`:
 * since anchors live on the same bounding rectangle, the anchor snap
 * usually wins when the pointer is close to a corner / midpoint, and
 * outline snap takes over for arbitrary positions in between.
 */
export const outlineSnapper: SnapContributor = {
  id: "outline",
  contribute(ctx) {
    if (ctx.gesture !== "draw-edge" && ctx.gesture !== "edit-edge-endpoint") return [];
    const out: SnapCandidate[] = [];
    for (const shape of ctx.scene.shapes.values()) {
      if (ctx.excludeShapeIds?.has(shape.id)) continue;
      if (!isProbeNearShape(shape, ctx.probe, ctx.threshold)) continue;
      const nearest = findNearestOutlinePoint(shape, ctx.probe);
      if (!nearest) continue;
      const dx = nearest.world.x - ctx.probe.x;
      const dy = nearest.world.y - ctx.probe.y;
      out.push({
        snapped: nearest.world,
        distance: dx * dx + dy * dy,
        kind: "outline",
        metadata: { shapeId: shape.id, ratio: nearest.ratio },
      });
    }
    return out;
  },
};

const isProbeNearShape = (shape: ShapeBase, probe: Vec2, threshold: number): boolean => {
  // Cheap AABB-around-position test. Hosts can register more precise
  // contributors if their shape types deserve it.
  const cushion = threshold;
  const px = probe.x - shape.position.x;
  const py = probe.y - shape.position.y;
  // Treat shapes as roughly bounded by a 1000-unit radius for the cheap
  // reject — this is intentionally generous; the inner `findNearestAnchor`
  // does the precise check.
  return Math.abs(px) <= 1000 + cushion && Math.abs(py) <= 1000 + cushion;
};
