import type { LayerId, ShapeId, Vec2 } from "@oh-just-another/types";
import type { FractionalIndex } from "fractional-keys";
import type { Shape } from "@oh-just-another/scene";

/**
 * Built-in template categories. Hosts can pass any string as a custom
 * category, but using one of the built-ins keeps the demo palette tidy.
 */
export type StandardCategory = "basic" | "flowchart";
export type Category = StandardCategory | (string & {});

/**
 * What the factory has to know about the host context: where to place the
 * new shape, which layer it belongs to, and how to spell its `order` key.
 *
 * The factory itself never reads from the scene — it just composes a shape
 * from the spec and these context fields.
 */
export interface TemplateContext {
  readonly id: ShapeId;
  readonly layerId: LayerId;
  /** Top-left in world coordinates where the shape should be placed. */
  readonly position: Vec2;
  /** Pre-allocated z-order key (caller can call `orderForTop`). */
  readonly order: FractionalIndex;
}

/**
 * A template is a *factory for a shape*. Given a `TemplateContext` it returns
 * a fully-typed `Shape` — no scene mutation, no async work.
 *
 * Plugins extend the system by registering their own `Template`s. Built-ins
 * cover `basic` (rectangle, ellipse, …) and `flowchart` (process, decision,
 * …) categories.
 */
export interface Template {
  readonly id: string;
  readonly name: string;
  readonly category: Category;
  /**
   * SVG markup or data-URI for the palette thumbnail. The kernel doesn't
   * impose a specific size; consumers usually render the icon at 24 × 24 px.
   */
  readonly icon: string;
  /**
   * Synchronous factory. Returns the shape the host should add to the scene.
   */
  factory(context: TemplateContext): Shape;
  /**
   * Free-form keywords for the palette search filter. Match is case-
   * insensitive substring across `name`, `category`, and these tags.
   * Use synonyms the user might actually type (e.g. `["rectangle",
   * "square", "rect", "box"]` for the rectangle template). Optional —
   * a template with no tags still matches by name / category.
   */
  readonly tags?: readonly string[];
  /** Free-form metadata (descriptions, etc). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
