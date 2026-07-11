/**
 * `defineShape()` — one-call facade for registering a custom shape type.
 *
 * A custom shape normally needs 2–4 registrations across packages: a bounder
 * in `@oh-just-another/scene` (spatial index / hit-test / culling), a renderer
 * in `@oh-just-another/renderer-core` (all backends), and optionally an
 * interactive hit-tester and a rotate-handle anchor in
 * `@oh-just-another/state`. This module folds them into a single declarative
 * spec so hosts extend the editor without learning the package layout.
 * Serialization needs no registration — unknown types pass through.
 */
import {
  registerBounder,
  type AnchorRef,
  type ElementBase,
  type ElementBounder,
} from "@oh-just-another/scene";
import { registerElementRenderer, type ElementRenderer } from "@oh-just-another/renderer-core";
import {
  registerInteractiveHitTester,
  registerRotateAnchor,
  type InteractiveHitTester,
} from "@oh-just-another/state";

/**
 * Declarative description of a custom shape type. `S` is the host's element
 * interface (extends `ElementBase` with the shape's own fields); `bounds` and
 * `render` receive it already narrowed.
 */
export interface ShapeSpec<S extends ElementBase = ElementBase> {
  /** Unique `type` discriminator — must not clash with built-in types. */
  readonly type: S["type"];
  /**
   * Local AABB of the shape (`registerBounder`). Drives the spatial index,
   * selection, hit-testing and culling.
   */
  readonly bounds: ElementBounder<S>;
  /**
   * Draws the shape onto a `RenderTarget` in local coordinates
   * (`registerElementRenderer`). Used by every backend — canvas, SVG, export.
   */
  readonly render: ElementRenderer<S>;
  /**
   * Optional pointer hit-tester for interactive sub-regions inside the shape
   * (`registerInteractiveHitTester`).
   */
  readonly interactiveHitTest?: InteractiveHitTester;
  /**
   * Optional rotate-handle anchor placement (`registerRotateAnchor`).
   * Defaults to the registry's built-in position when omitted.
   */
  readonly rotateAnchor?: AnchorRef;
}

/** Handle returned by {@link defineShape}. */
export interface ShapeRegistration {
  /**
   * Deregisters the shape. The underlying registries are currently
   * append-only (no `unregister` API), so this is a documented no-op kept for
   * forward compatibility — dispose-site code will start working once the
   * registries grow removal support.
   */
  dispose(): void;
}

const noopDispose = (): void => undefined;

/**
 * Register a custom shape type in every relevant registry in one call.
 *
 * ```ts
 * defineShape({
 *   type: "sticker",
 *   bounds: (s) => ({ x: 0, y: 0, width: s.size, height: s.size }),
 *   render: (s, target) => {
 *     target.setFill(s.style.fill ?? "#facc15");
 *     target.beginPath();
 *     target.rect(0, 0, s.size, s.size);
 *     target.fill();
 *   },
 * });
 * ```
 */
export const defineShape = <S extends ElementBase>(spec: ShapeSpec<S>): ShapeRegistration => {
  registerBounder<S>(spec.type, spec.bounds);
  registerElementRenderer<S>(spec.type, spec.render);
  if (spec.interactiveHitTest) registerInteractiveHitTester(spec.type, spec.interactiveHitTest);
  if (spec.rotateAnchor) registerRotateAnchor(spec.type, spec.rotateAnchor);
  return { dispose: noopDispose };
};
