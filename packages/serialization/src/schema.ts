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

const RoundnessZ = z
  .object({
    type: z.enum(["sharp", "round"]),
    value: z.number().optional(),
  })
  .strict();

const StyleZ = z
  .object({
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    opacity: z.number().optional(),
    dashArray: z.array(z.number()).readonly().optional(),
    lineCap: z.enum(["butt", "round", "square"]).optional(),
    lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
    strokeAlign: z.enum(["center", "inside", "outside"]).optional(),
    roundness: RoundnessZ.optional(),
  })
  .strict();

const TextStyleZ = StyleZ.extend({
  textAlign: z.enum(["left", "center", "right"]).optional(),
  textBaseline: z.enum(["top", "middle", "bottom"]).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textDecoration: z
    .object({
      underline: z.boolean().optional(),
      strikethrough: z.boolean().optional(),
    })
    .strict()
    .optional(),
}).strict();

const MetadataZ = z.record(z.string(), z.unknown()).optional();

// --- Anchors (referenced by both shapes and edges) ---

const NamedAnchorZ = z.string(); // open enum (StandardAnchor + custom)
const AnchorRefZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("named"), name: NamedAnchorZ }).strict(),
  z.object({ kind: z.literal("ratio"), position: Vec2Z }).strict(),
  z.object({ kind: z.literal("absolute"), offset: Vec2Z }).strict(),
  z
    .object({ kind: z.literal("edge"), index: z.number().int().nonnegative(), t: z.number() })
    .strict(),
]);

// --- Shapes ---

const ElementBaseZ = z.object({
  id: z.string(),
  layerId: z.string(),
  position: Vec2Z,
  rotation: z.number(),
  scale: Vec2Z,
  order: z.string(),
  metadata: MetadataZ,
  minWidth: z.number().optional(),
  minHeight: z.number().optional(),
  maxWidth: z.number().optional(),
  maxHeight: z.number().optional(),
  noFlip: z.boolean().optional(),
  anchors: z.record(z.string(), AnchorRefZ).optional(),
  parentId: z.string().optional(),
  href: z.string().optional(),
});

const RectangleZ = ElementBaseZ.extend({
  type: z.literal("rectangle"),
  style: StyleZ,
  width: z.number(),
  height: z.number(),
}).strict();

const EllipseZ = ElementBaseZ.extend({
  type: z.literal("ellipse"),
  style: StyleZ,
  width: z.number(),
  height: z.number(),
}).strict();

const PolygonZ = ElementBaseZ.extend({
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

const PathZ = ElementBaseZ.extend({
  type: z.literal("path"),
  style: StyleZ,
  commands: z.array(PathCommandZ),
}).strict();

const TextZ = ElementBaseZ.extend({
  type: z.literal("text"),
  style: TextStyleZ,
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  maxWidth: z.number().optional(),
}).strict();

const ImageZ = ElementBaseZ.extend({
  type: z.literal("image"),
  style: StyleZ,
  src: z.string(),
  width: z.number(),
  height: z.number(),
  // Points at a `Scene.files` BinaryFile entry. Set by `buildImageElement`
  // on every insert.
  fileId: z.string().optional(),
  // Animated-content hints (gif / lottie / video).
  animationKind: z.string().optional(),
  animationData: z.unknown().optional(),
}).strict();

const TemplateInstanceZ = ElementBaseZ.extend({
  type: z.literal("template"),
  style: StyleZ.optional(),
  templateId: z.string(),
  data: z.record(z.string(), z.unknown()),
  width: z.number(),
  height: z.number(),
}).strict();

const GroupZ = ElementBaseZ.extend({
  type: z.literal("group"),
  style: StyleZ.optional(),
}).strict();

const BrushPointZ = z.object({ x: z.number(), y: z.number(), width: z.number() }).strict();

const BrushZ = ElementBaseZ.extend({
  type: z.literal("brush"),
  style: StyleZ,
  points: z.array(BrushPointZ),
}).strict();

/**
 * Unknown-shape escape hatch: plugins that register custom shape types may
 * persist them. Accepts any object with the standard base fields plus a
 * non-builtin `type`, and lets the bounder registry handle them at load time.
 */
const CustomElementZ = ElementBaseZ.extend({
  type: z.string(),
  style: StyleZ.optional(),
})
  .passthrough()
  .refine(
    (s) =>
      ![
        "rectangle",
        "ellipse",
        "polygon",
        "path",
        "text",
        "image",
        "template",
        "group",
        "brush",
      ].includes(s.type),
    {
      message: "Use the specific built-in schema for built-in shape types",
    },
  );

const ElementZ = z.union([
  RectangleZ,
  EllipseZ,
  PolygonZ,
  PathZ,
  TextZ,
  ImageZ,
  TemplateInstanceZ,
  GroupZ,
  BrushZ,
  CustomElementZ,
]);

// --- Links ---

const LinkEndpointZ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("point"), position: Vec2Z }).strict(),
  z.object({ kind: z.literal("anchor"), elementId: z.string(), anchor: AnchorRefZ }).strict(),
  z.object({ kind: z.literal("outline"), elementId: z.string(), ratio: z.number() }).strict(),
  z.object({ kind: z.literal("floating"), elementId: z.string() }).strict(),
]);

const LinkRoutingZ = z.enum(["straight", "orthogonal", "bezier"]);
const ArrowheadStyleZ = z.enum([
  "none",
  "arrow",
  "openArrow",
  "roundedArrow",
  "arcArrow",
  "triangle",
  "filledArrow",
  "circle",
  "filledCircle",
  "diamond",
  "rhombus",
  "filledRhombus",
  "erdOne",
  "erdOnlyOne",
  "erdMany",
  "erdOneOrMany",
  "erdZeroOrOne",
  "erdZeroOrMany",
]);
const LinkArrowheadsZ = z
  .object({
    from: ArrowheadStyleZ.optional(),
    to: ArrowheadStyleZ.optional(),
    size: z.number().optional(),
  })
  .strict();
const LinkLabelZ = z
  .object({
    text: z.string(),
    position: z.number().optional(),
    fontSize: z.number().optional(),
    fill: z.string().optional(),
    background: z.string().optional(),
  })
  .strict();

const LinkZ = z
  .object({
    id: z.string(),
    layerId: z.string(),
    from: LinkEndpointZ,
    to: LinkEndpointZ,
    waypoints: z.array(Vec2Z).readonly().optional(),
    routedPoints: z.array(Vec2Z).readonly().optional(),
    fixedSegments: z
      .array(z.object({ axis: z.enum(["h", "v"]), pos: z.number(), at: z.number() }).strict())
      .readonly()
      .optional(),
    routing: LinkRoutingZ.optional(),
    arrowheads: LinkArrowheadsZ.optional(),
    label: LinkLabelZ.optional(),
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
    gridSize: z.number().optional(),
    gridStyle: z.enum(["lines", "dots"]).optional(),
    snapToGrid: z.boolean().optional(),
  })
  .strict();

// --- Annotations ---

const CommentZ = z
  .object({
    id: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    body: z.string(),
    createdAt: z.string(),
  })
  .strict();

const AnnotationZ = z
  .object({
    id: z.string(),
    elementId: z.string().nullable(),
    position: Vec2Z,
    resolved: z.boolean(),
    thread: z.array(CommentZ),
    createdAt: z.string(),
  })
  .strict();

// --- Document ---

export const SceneDocumentZ = z
  .object({
    /** Magic to make a `.json` file recognisable without sniffing. */
    format: z.literal("oh-just-another/scene"),
    version: z.number().int().nonnegative(),
    elements: z.array(ElementZ),
    links: z.array(LinkZ),
    layers: z.array(LayerZ),
    /**
     * Threaded comments. Optional for backwards compatibility — documents
     * without an `annotations` field deserialize as an empty thread list.
     */
    annotations: z.array(AnnotationZ).optional(),
    viewport: ViewportZ,
  })
  .strict();

export type SceneDocument = z.infer<typeof SceneDocumentZ>;

export type SerializedElement = z.infer<typeof ElementZ>;
export type SerializedLink = z.infer<typeof LinkZ>;
export type SerializedLayer = z.infer<typeof LayerZ>;
export type SerializedViewport = z.infer<typeof ViewportZ>;
export type SerializedAnnotation = z.infer<typeof AnnotationZ>;
export type SerializedComment = z.infer<typeof CommentZ>;
