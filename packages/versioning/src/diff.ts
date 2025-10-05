import type { AnnotationId, LinkId, LayerId, ElementId } from "@oh-just-another/types";
import type { Scene } from "@oh-just-another/scene";

/**
 * Cheap structural diff between two scenes. Reports ids per category
 * (shapes / edges / layers / annotations) split into `added`, `removed`,
 * and `modified` (same id, different value).
 *
 * Identity comparison (`!==`) is enough because our scene ops always
 * return new objects on change — same as the rationale behind
 * `ShapeCache`. Skips deep structural comparison; if two snapshots
 * have identical content but the host re-built shape objects, those
 * shapes will appear as "modified" until a smarter equality is wired.
 */
export interface SceneDiff {
  readonly elements: DiffCategory<ElementId>;
  readonly links: DiffCategory<LinkId>;
  readonly layers: DiffCategory<LayerId>;
  readonly annotations: DiffCategory<AnnotationId>;
}

export interface DiffCategory<Id> {
  readonly added: readonly Id[];
  readonly removed: readonly Id[];
  readonly modified: readonly Id[];
}

export const diffScenes = (before: Scene, after: Scene): SceneDiff => ({
  elements: diffMap(before.elements, after.elements),
  links: diffMap(before.links, after.links),
  layers: diffMap(before.layers, after.layers),
  annotations: diffMap(before.annotations, after.annotations),
});

const diffMap = <K, V>(before: ReadonlyMap<K, V>, after: ReadonlyMap<K, V>): DiffCategory<K> => {
  const added: K[] = [];
  const removed: K[] = [];
  const modified: K[] = [];
  for (const [id, value] of after) {
    const prev = before.get(id);
    if (prev === undefined) added.push(id);
    else if (prev !== value) modified.push(id);
  }
  for (const [id] of before) {
    if (!after.has(id)) removed.push(id);
  }
  return { added, removed, modified };
};

/** True when the diff has zero changes across every category. */
export const isEmptyDiff = (d: SceneDiff): boolean =>
  d.elements.added.length === 0 &&
  d.elements.removed.length === 0 &&
  d.elements.modified.length === 0 &&
  d.links.added.length === 0 &&
  d.links.removed.length === 0 &&
  d.links.modified.length === 0 &&
  d.layers.added.length === 0 &&
  d.layers.removed.length === 0 &&
  d.layers.modified.length === 0 &&
  d.annotations.added.length === 0 &&
  d.annotations.removed.length === 0 &&
  d.annotations.modified.length === 0;
