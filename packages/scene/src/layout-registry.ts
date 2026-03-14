import type { ElementId, Vec2 } from "@oh-just-another/types";
import type { Patch } from "./patch.js";
import type { Scene } from "./scene.js";

/**
 * Pluggable layout registry.
 *
 * The built-in `AutoLayoutSpec` union is closed (grid / stack /
 * tree); the registry lets hosts add their own kinds without
 * widening the union. Each entry pairs a string `kind` with two
 * functions:
 *
 *   • `parse(metadata)` reads a shape's `metadata.autoLayout`
 *     payload and returns a validated spec (or `null` if the
 *     payload doesn't apply). This is what `getAutoLayoutSpec`
 *     consults after exhausting built-ins.
 *   • `run(scene, parentId, children, origin, spec)` produces the
 *     batched `Patch` (or `null` when nothing changed). The
 *     registry passes a pre-computed `children` list + dropzone-
 *     aware `origin` so plugins don't reimplement those.
 *
 * Registration is process-global — same model as the renderer
 * registry. Hosts opt in via `registerLayoutKind("radial", ...)`;
 * unregister returns the previous entry (mostly useful in tests).
 */

export interface LayoutKindEntry<Spec = unknown> {
  readonly kind: string;
  parse(metadata: unknown): Spec | null;
  run(
    scene: Scene,
    parentId: ElementId,
    children: readonly ElementId[],
    origin: Vec2,
    spec: Spec,
  ): Patch | null;
}

const registry = new Map<string, LayoutKindEntry>();

export const registerLayoutKind = <S>(entry: LayoutKindEntry<S>): void => {
  registry.set(entry.kind, entry);
};

export const unregisterLayoutKind = (kind: string): LayoutKindEntry | undefined => {
  const prev = registry.get(kind);
  registry.delete(kind);
  return prev;
};

export const getLayoutKind = (kind: string): LayoutKindEntry | undefined =>
  registry.get(kind);

/** Iterate every registered kind — useful for diagnostics / lints. */
export const listLayoutKinds = (): readonly string[] => [...registry.keys()];
