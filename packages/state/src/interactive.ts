import type { ShapeBase } from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";
import type { InteractionEmit } from "./machine";

/**
 * Per-shape-type hit-tester for interactive sub-elements (buttons inside a
 * rich template, drop-zones, etc). Returns an emit that the editor should fire
 * instead of a normal selection / drag press.
 *
 * `localPoint` is the pointer in the shape's local coordinate space (after the
 * shape's `position` / `rotation` / `scale` are removed). Returning `null`
 * means "no interactive element here — fall back to default press".
 */
export type InteractiveHitTester = (shape: ShapeBase, localPoint: Vec2) => InteractionEmit | null;

const registry = new Map<string, InteractiveHitTester>();

/**
 * Register an interactive hit-tester for a shape `type`. Plugins call this
 * once at module load. The kernel ships nothing here — `@templates` registers
 * the rich-template tester via `installTemplateShapeRenderer()`.
 */
export const registerInteractiveHitTester = (type: string, fn: InteractiveHitTester): void => {
  registry.set(type, fn);
};

export const getInteractiveHitTester = (type: string): InteractiveHitTester | undefined =>
  registry.get(type);

export const __clearInteractiveHitTesters = (): void => {
  registry.clear();
};
