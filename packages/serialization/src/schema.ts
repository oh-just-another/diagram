import { z } from "zod";

/**
 * Wire format version. Bump on any breaking schema change; add a migration in
 * `migrations.ts` that upgrades the older shape to the current one.
 */
export const CURRENT_VERSION = 1;

// --- Atoms ---

const Vec2Z = z.object({ x: z.number(), y: z.number() });
const BoundsZ = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
void BoundsZ;

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

const MetadataZ = z.record(z.string(), z.unknown()).optional();

// --- Shapes ---

const ShapeBaseZ = z.object({
  id: z.string(),
  layerId: z.string(),
  position: Vec2Z,
  rotation: z.number(),
  scale: Vec2Z,
  order: z.string(),
  metadata: MetadataZ,
});

const RectangleZ = ShapeBaseZ.extend({
  type: z.literal("rectangle"),
  style: StyleZ,
  width: z.number(),
  height: z.number(),
}).strict();

const EllipseZ = ShapeBaseZ.extend({
  type: z.literal("ellipse"),
  style: StyleZ,
  width: z.number(),
  height: z.number(),
}).strict();

const PolygonZ = ShapeBaseZ.extend({
  type: z.literal("polygon"),
  style: StyleZ,
  points: z.array(Vec2Z),
}).strict();

const PathCommandZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("M"), to: Vec2Z }).strict(),
  z.object({ kind: z.literal("L"), to: Vec2Z }).strict(),
  z.object({ kind: z.literal("Q"), control: Vec2Z, to: Vec2Z }).strict(),
  z.object({ kind: z.literal("C"), control1: Vec2Z, control2: Vec2Z, to: Vec2Z }).strict(),
  z.object({ kind: z.literal("Z") }).strict(),
]);

const PathZ = ShapeBaseZ.extend({
  type: z.literal("path"),
  style: StyleZ,
  commands: z.array(PathCommandZ),
}).strict();

const TextZ = ShapeBaseZ.extend({
  type: z.literal("text"),
  style: TextStyleZ,
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  maxWidth: z.number().optional(),
}).strict();

const ImageZ = ShapeBaseZ.extend({
  type: z.literal("image"),
  style: StyleZ,
  src: z.string(),
  width: z.number(),
  height: z.number(),
}).strict();

/**
 * Unknown-shape escape hatch: plugins that register custom shape types may
 * persist them. Accepts any object with the standard base fields plus a
 * non-builtin `type`, and lets the bounder registry handle them at load time.
 */
const CustomShapeZ = ShapeBaseZ.extend({
  type: z.string(),
  style: StyleZ.optional(),
})
  .passthrough()
  .refine((s) => !["rectangle", "ellipse", "polygon", "path", "text", "image"].includes(s.type), {
    message: "Use the specific built-in schema for built-in shape types",
  });

const ShapeZ = z.union([RectangleZ, EllipseZ, PolygonZ, PathZ, TextZ, ImageZ, CustomShapeZ]);

// --- Edges ---

const NamedAnchorZ = z.string(); // open enum (StandardAnchor + custom)
const AnchorRefZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("named"), name: NamedAnchorZ }).strict(),
  z.object({ kind: z.literal("ratio"), position: Vec2Z }).strict(),
]);
const EdgeEndpointZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("point"), position: Vec2Z }).strict(),
  z.object({ kind: z.literal("anchor"), shapeId: z.string(), anchor: AnchorRefZ }).strict(),
]);

const EdgeZ = z
  .object({
    id: z.string(),
    layerId: z.string(),
    from: EdgeEndpointZ,
    to: EdgeEndpointZ,
    waypoints: z.array(Vec2Z).readonly().optional(),
    order: z.string(),
    style: StyleZ,
    metadata: MetadataZ,
  })
  .strict();

// --- Layers ---

const LayerZ = z
  .object({
    id: z.string(),
    name: z.string(),
    visible: z.boolean(),
    locked: z.boolean(),
    order: z.string(),
  })
  .strict();

// --- Viewport ---

const ViewportZ = z
  .object({
    pan: Vec2Z,
    zoom: z.number(),
    rotation: z.number(),
    size: z.object({ width: z.number(), height: z.number() }).strict(),
  })
  .strict();

// --- Document ---

export const SceneDocumentZ = z
  .object({
    /** Magic to make a `.json` file recognisable without sniffing. */
    format: z.literal("oh-just-another/scene"),
    version: z.number().int().nonnegative(),
    shapes: z.array(ShapeZ),
    edges: z.array(EdgeZ),
    layers: z.array(LayerZ),
    viewport: ViewportZ,
  })
  .strict();

export type SceneDocument = z.infer<typeof SceneDocumentZ>;

export type SerializedShape = z.infer<typeof ShapeZ>;
export type SerializedEdge = z.infer<typeof EdgeZ>;
export type SerializedLayer = z.infer<typeof LayerZ>;
export type SerializedViewport = z.infer<typeof ViewportZ>;
