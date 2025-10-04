import type { Patch } from "@oh-just-another/scene";

type ElementPatch = Extract<Patch, { kind: "element" }>;
type LinkPatch = Extract<Patch, { kind: "link" }>;
type LayerPatch = Extract<Patch, { kind: "layer" }>;
type AnnotationPatch = Extract<Patch, { kind: "annotation" }>;
type ViewportPatch = Extract<Patch, { kind: "viewport" }>;
type FilePatch = Extract<Patch, { kind: "file" }>;

interface Slot<P> {
  first: P;
  latest: P;
}

/**
 * Merge a sequence of patches produced inside a single transaction so that
 * each entity has at most one patch. The merged patch keeps the *first*
 * `before` and the *last* `after` for that entity — the round trip is
 * indistinguishable from applying the whole sequence, but the patch list is
 * O(touched entities) rather than O(gesture-tick count).
 *
 * Batches are flattened before merging. Viewport patches are merged the same
 * way (only one slot). Patches that turn out to be no-ops (`before === after`
 * after the merge) are dropped. First-appearance order is preserved.
 */
export const mergeByEntity = (patches: readonly Patch[]): readonly Patch[] => {
  const shapes = new Map<string, Slot<ElementPatch>>();
  const edges = new Map<string, Slot<LinkPatch>>();
  const layers = new Map<string, Slot<LayerPatch>>();
  const annotations = new Map<string, Slot<AnnotationPatch>>();
  const files = new Map<string, Slot<FilePatch>>();
  let viewport: Slot<ViewportPatch> | null = null;

  const order: Patch[] = [];
  let viewportOrderIndex = -1;

  const visit = (p: Patch) => {
    if (p.kind === "batch") {
      for (const inner of p.patches) visit(inner);
      return;
    }
    if (p.kind === "element") {
      const existing = shapes.get(p.id);
      if (existing) {
        existing.latest = { ...existing.latest, after: p.after };
      } else {
        shapes.set(p.id, { first: p, latest: p });
        order.push(p);
      }
      return;
    }
    if (p.kind === "link") {
      const existing = edges.get(p.id);
      if (existing) {
        existing.latest = { ...existing.latest, after: p.after };
      } else {
        edges.set(p.id, { first: p, latest: p });
        order.push(p);
      }
      return;
    }
    if (p.kind === "layer") {
      const existing = layers.get(p.id);
      if (existing) {
        existing.latest = { ...existing.latest, after: p.after };
      } else {
        layers.set(p.id, { first: p, latest: p });
        order.push(p);
      }
      return;
    }
    if (p.kind === "annotation") {
      const existing = annotations.get(p.id);
      if (existing) {
        existing.latest = { ...existing.latest, after: p.after };
      } else {
        annotations.set(p.id, { first: p, latest: p });
        order.push(p);
      }
      return;
    }
    if (p.kind === "file") {
      const existing = files.get(p.id);
      if (existing) {
        existing.latest = { ...existing.latest, after: p.after };
      } else {
        files.set(p.id, { first: p, latest: p });
        order.push(p);
      }
      return;
    }
    if (viewport) {
      viewport = { first: viewport.first, latest: { ...viewport.latest, after: p.after } };
    } else {
      viewport = { first: p, latest: p };
      viewportOrderIndex = order.length;
      order.push(p);
    }
  };

  for (const p of patches) visit(p);

  const out: Patch[] = [];
  for (let i = 0; i < order.length; i++) {
    const p = order[i]!;
    let merged: Patch;
    if (p.kind === "element") {
      const slot = shapes.get(p.id)!;
      merged = {
        kind: "element",
        id: slot.first.id,
        before: slot.first.before,
        after: slot.latest.after,
      };
    } else if (p.kind === "link") {
      const slot = edges.get(p.id)!;
      merged = {
        kind: "link",
        id: slot.first.id,
        before: slot.first.before,
        after: slot.latest.after,
      };
    } else if (p.kind === "layer") {
      const slot = layers.get(p.id)!;
      merged = {
        kind: "layer",
        id: slot.first.id,
        before: slot.first.before,
        after: slot.latest.after,
      };
    } else if (p.kind === "annotation") {
      const slot = annotations.get(p.id)!;
      merged = {
        kind: "annotation",
        id: slot.first.id,
        before: slot.first.before,
        after: slot.latest.after,
      };
    } else if (p.kind === "file") {
      const slot = files.get(p.id)!;
      merged = {
        kind: "file",
        id: slot.first.id,
        before: slot.first.before,
        after: slot.latest.after,
      };
    } else if (i === viewportOrderIndex && viewport !== null) {
      const vp: Slot<ViewportPatch> = viewport;
      merged = { kind: "viewport", before: vp.first.before, after: vp.latest.after };
    } else {
      continue;
    }
    if (isMergedNoop(merged)) continue;
    out.push(merged);
  }
  return out;
};

const isMergedNoop = (p: Patch): boolean => {
  if (
    p.kind === "element" ||
    p.kind === "link" ||
    p.kind === "layer" ||
    p.kind === "annotation" ||
    p.kind === "file"
  ) {
    return p.before === p.after;
  }
  if (p.kind === "viewport") return p.before === p.after;
  return false;
};
