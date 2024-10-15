import { z } from "zod";
import type { Shape, TemplateShape as SceneTemplateShape } from "@oh-just-another/scene";
import { layoutTree } from "./rich/layout.js";
import { extractPorts } from "./rich/ports.js";
import { extractDropZone } from "./rich/drop-zones.js";
import { defaultRichRegistry } from "./rich/registry.js";
import type { TemplateNode } from "./rich/node.js";
import type { LayoutStyle, NodeStyle } from "./rich/style.js";
import type { Template, TemplateContext } from "./types.js";

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
  // Rich-template blueprint: serializable node tree + default data. Validated
  // loosely here (`root` / `defaults` are `unknown` objects) because the rich
  // tree schema is recursive — full validation runs against the live tree at
  // `templateFromSpec` time via the rich-template renderer's loaders.
  z
    .object({
      type: z.literal("template"),
      root: z.unknown(),
      defaults: z.record(z.string(), z.unknown()).optional(),
      width: z.number(),
      height: z.number(),
      schema: z.record(z.string(), z.enum(["string", "number", "boolean"])).optional(),
      minWidth: z.number().optional(),
      minHeight: z.number().optional(),
      maxWidth: z.number().optional(),
      maxHeight: z.number().optional(),
      noFlip: z.boolean().optional(),
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
 *
 * For `type: "template"` blueprints the rich template tree is also registered
 * in `defaultRichRegistry` so the renderer can find it by id. Repeated calls
 * with the same `spec.id` use `replace` to keep the registry consistent with
 * the most recent definition.
 */
export const templateFromSpec = (spec: TemplateSpec): Template => {
  const blueprint = spec.blueprint;

  if (blueprint.type === "template") {
    // Side-effect: register the rich tree so the kernel renderer can resolve
    // `templateId` → tree at draw time. `replace` makes repeated
    // `loadTemplateLibrary` calls idempotent.
    defaultRichRegistry.replace({
      id: spec.id,
      name: spec.name,
      category: spec.category,
      icon: spec.icon,
      root: blueprint.root as TemplateNode,
      ...(blueprint.defaults !== undefined ? { defaults: blueprint.defaults } : {}),
      ...(blueprint.minWidth !== undefined ? { minWidth: blueprint.minWidth } : {}),
      ...(blueprint.minHeight !== undefined ? { minHeight: blueprint.minHeight } : {}),
      ...(blueprint.maxWidth !== undefined ? { maxWidth: blueprint.maxWidth } : {}),
      ...(blueprint.maxHeight !== undefined ? { maxHeight: blueprint.maxHeight } : {}),
      ...(blueprint.noFlip !== undefined ? { noFlip: blueprint.noFlip } : {}),
    });

    return {
      id: spec.id,
      name: spec.name,
      category: spec.category,
      icon: spec.icon,
      ...(spec.metadata !== undefined ? { metadata: spec.metadata } : {}),
      factory: (ctx: TemplateContext): Shape => {
        // Lay the template out once at its declared natural size to
        // extract every `port` node into a ratio-anchor map. The ratios
        // survive resize — the editor's anchor-resolve always reads
        // current bounds, then multiplies by `position`.
        // `blueprint.root` is `unknown` per the spec schema (validation
        // happens at instantiation time, not load time). Cast — if the
        // root is malformed `layoutTree` will throw with a useful error.
        const layouted = layoutTree(blueprint.root as TemplateNode, {
          available: { width: blueprint.width, height: blueprint.height },
        });
        const portAnchors = extractPorts(layouted);
        // The first drop-zone node in the template tree turns this shape into
        // a container per the @scene container protocol: shapes dragged into
        // this area get `parentId = this.id` and move together with the
        // template.
        const dropZone = extractDropZone(layouted);

        const shape: SceneTemplateShape = {
          id: ctx.id,
          layerId: ctx.layerId,
          type: "template",
          templateId: spec.id,
          data: blueprint.defaults ?? {},
          position: ctx.position,
          rotation: 0,
          scale: { x: 1, y: 1 },
          order: ctx.order,
          style: {},
          width: blueprint.width,
          height: blueprint.height,
          ...(Object.keys(portAnchors).length > 0 ? { anchors: portAnchors } : {}),
          ...(blueprint.minWidth !== undefined ? { minWidth: blueprint.minWidth } : {}),
          ...(blueprint.minHeight !== undefined ? { minHeight: blueprint.minHeight } : {}),
          ...(blueprint.maxWidth !== undefined ? { maxWidth: blueprint.maxWidth } : {}),
          ...(blueprint.maxHeight !== undefined ? { maxHeight: blueprint.maxHeight } : {}),
          ...(blueprint.noFlip !== undefined ? { noFlip: blueprint.noFlip } : {}),
          ...(dropZone ? { metadata: { container: { dropZone, padding: 8 } } } : {}),
        };
        return shape;
      },
    };
  }

  // Simple, shape-blueprint case (rectangle / ellipse / polygon / path / text / image).
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    icon: spec.icon,
    ...(spec.metadata !== undefined ? { metadata: spec.metadata } : {}),
    factory: (ctx: TemplateContext): Shape =>
      ({
        ...stripUndefined(blueprint),
        id: ctx.id,
        layerId: ctx.layerId,
        position: ctx.position,
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: ctx.order,
      }) as Shape,
  };
};

// Quiet the unused-var checker for imports kept around for callers' .d.ts.
void (null as unknown as LayoutStyle | NodeStyle);
