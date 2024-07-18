import { z } from "zod";
import type { Shape } from "@oh-just-another/scene";
import type { Template, TemplateContext } from "./types";

/**
 * A `TemplateSpec` is the *serializable* form of a `Template`. Functions
 * cannot be persisted, so the runtime factory is reconstructed from a static
 * shape blueprint plus the host-supplied `TemplateContext`.
 *
 * Use `templateFromSpec(spec)` to turn a spec into a callable `Template`, and
 * `loadTemplateLibrary(input)` to import a whole `.json` file.
 */

const Vec2Z = z.object({ x: z.number(), y: z.number() });

const StyleZ = z
  .object({
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    opacity: z.number().optional(),
    dashArray: z.array(z.number()).readonly().optional(),
    lineCap: z.enum(["butt", "round", "square"]).optional(),
    lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
  })
  .strict();

const TextStyleZ = StyleZ.extend({
  textAlign: z.enum(["left", "center", "right"]).optional(),
  textBaseline: z.enum(["top", "middle", "bottom"]).optional(),
}).strict();

const PathCommandZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("M"), to: Vec2Z }).strict(),
  z.object({ kind: z.literal("L"), to: Vec2Z }).strict(),
  z.object({ kind: z.literal("Q"), control: Vec2Z, to: Vec2Z }).strict(),
  z.object({ kind: z.literal("C"), control1: Vec2Z, control2: Vec2Z, to: Vec2Z }).strict(),
  z.object({ kind: z.literal("Z") }).strict(),
]);

/**
 * Shape blueprint — all the shape's fields *except* identity / placement,
 * which come from the runtime `TemplateContext`. Plugin authors describe
 * their shapes here.
 */
export const ShapeBlueprintZ = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("rectangle"),
      style: StyleZ,
      width: z.number(),
      height: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ellipse"),
      style: StyleZ,
      width: z.number(),
      height: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal("polygon"),
      style: StyleZ,
      points: z.array(Vec2Z),
    })
    .strict(),
  z
    .object({
      type: z.literal("path"),
      style: StyleZ,
      commands: z.array(PathCommandZ),
    })
    .strict(),
  z
    .object({
      type: z.literal("text"),
      style: TextStyleZ,
      text: z.string(),
      fontFamily: z.string(),
      fontSize: z.number(),
      maxWidth: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("image"),
      style: StyleZ,
      src: z.string(),
      width: z.number(),
      height: z.number(),
    })
    .strict(),
]);

export type ShapeBlueprint = z.infer<typeof ShapeBlueprintZ>;

export const TemplateSpecZ = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    icon: z.string(),
    blueprint: ShapeBlueprintZ,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type TemplateSpec = z.infer<typeof TemplateSpecZ>;

/**
 * `.json` library bundle. Authors ship one of these to share templates;
 * editor reads it via `loadTemplateLibrary`.
 */
export const TemplateLibrarySpecZ = z
  .object({
    format: z.literal("oh-just-another/template-library"),
    version: z.literal(1),
    templates: z.array(TemplateSpecZ),
  })
  .strict();

export type TemplateLibrarySpec = z.infer<typeof TemplateLibrarySpecZ>;

const stripUndefined = <T extends object>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
};

/**
 * Reconstruct a callable `Template` from a `TemplateSpec`. The factory closes
 * over the blueprint and is otherwise pure.
 */
export const templateFromSpec = (spec: TemplateSpec): Template => ({
  id: spec.id,
  name: spec.name,
  category: spec.category,
  icon: spec.icon,
  ...(spec.metadata !== undefined ? { metadata: spec.metadata } : {}),
  factory: (ctx: TemplateContext): Shape =>
    ({
      ...stripUndefined(spec.blueprint),
      id: ctx.id,
      layerId: ctx.layerId,
      position: ctx.position,
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: ctx.order,
    }) as Shape,
});
