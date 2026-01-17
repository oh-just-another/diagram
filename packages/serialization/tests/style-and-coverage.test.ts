import { describe, expect, it } from "vitest";
import { elementId, fileId, linkId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
  type Link,
} from "@oh-just-another/scene";
import {
  deserializeScene,
  DeserializationError,
  parseScene,
  serializeScene,
  stringifyScene,
} from "../src/index";

// ---------------------------------------------------------------------------
// Builders. Objects are spelled out (cast through `unknown`) so a test fixture
// isn't constrained by editor-side construction helpers — these tests assert
// the serializer preserves whatever the kernel can legally hold.
// ---------------------------------------------------------------------------

const base = (id: string) => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  position: { x: 1, y: 2 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
});

const rectWith = (id: string, style: Record<string, unknown>): Element =>
  ({ ...base(id), type: "rectangle", style, width: 10, height: 20 }) as unknown as Element;

const styleOf = (scene: ReturnType<typeof emptyScene>, id: string): Record<string, unknown> =>
  (scene.elements.get(elementId(id)) as unknown as { style: Record<string, unknown> }).style;

const roundTripElement = (el: Element): ReturnType<typeof emptyScene> => {
  let scene = emptyScene();
  ({ scene } = addElement(scene, el));
  return deserializeScene(serializeScene(scene));
};

// ===========================================================================
// Style — field-coverage. A field present on the `Style` type but missing from
// the (strict) schema makes the whole scene unparseable on reload and silently
// falls back to the demo. These tests fail loudly if any known style field is
// dropped or rejected.
// ===========================================================================

describe("Style round-trip (every field survives)", () => {
  it("preserves a kitchen-sink style verbatim", () => {
    const fullStyle = {
      fill: "#ff0000",
      stroke: "#00ff00",
      strokeWidth: 3,
      opacity: 0.5,
      dashArray: [4, 2],
      lineCap: "round",
      lineJoin: "bevel",
      strokeAlign: "inside",
      roundness: { type: "round", value: 16 },
    };
    const restored = roundTripElement(rectWith("r", fullStyle));
    expect(styleOf(restored, "r")).toEqual(fullStyle);
  });

  it("preserves roundness (round + value)", () => {
    const restored = roundTripElement(rectWith("r", { roundness: { type: "round", value: 12 } }));
    expect(styleOf(restored, "r").roundness).toEqual({ type: "round", value: 12 });
  });

  it("preserves roundness (round, adaptive — no value)", () => {
    const restored = roundTripElement(rectWith("r", { roundness: { type: "round" } }));
    expect(styleOf(restored, "r").roundness).toEqual({ type: "round" });
  });

  it("preserves roundness (sharp)", () => {
    const restored = roundTripElement(rectWith("r", { roundness: { type: "sharp" } }));
    expect(styleOf(restored, "r").roundness).toEqual({ type: "sharp" });
  });

  it("preserves each strokeAlign value", () => {
    for (const a of ["center", "inside", "outside"] as const) {
      const restored = roundTripElement(rectWith(`r-${a}`, { strokeAlign: a }));
      expect(styleOf(restored, `r-${a}`).strokeAlign).toBe(a);
    }
  });

  it("stringify → parse keeps roundness (does not fall back / throw)", () => {
    let scene = emptyScene();
    ({ scene } = addElement(scene, rectWith("r", { roundness: { type: "round", value: 8 } })));
    const json = stringifyScene(scene, 2);
    expect(json).toContain('"roundness"');
    const restored = parseScene(json);
    expect(styleOf(restored, "r").roundness).toEqual({ type: "round", value: 8 });
  });

  it("an empty style round-trips to an empty style", () => {
    const restored = roundTripElement(rectWith("r", {}));
    expect(styleOf(restored, "r")).toEqual({});
  });

  it("TextStyle inherits roundness/strokeAlign from the base schema", () => {
    const t: Element = {
      ...base("t"),
      type: "text",
      style: {
        fill: "#000",
        strokeAlign: "outside",
        roundness: { type: "round", value: 4 },
        textAlign: "right",
        fontWeight: "bold",
      },
      text: "hi",
      fontFamily: "system-ui",
      fontSize: 14,
    } as unknown as Element;
    const restored = roundTripElement(t);
    expect(styleOf(restored, "t")).toEqual({
      fill: "#000",
      strokeAlign: "outside",
      roundness: { type: "round", value: 4 },
      textAlign: "right",
      fontWeight: "bold",
    });
  });
});

// ===========================================================================
// Shapes — each built-in type with its type-specific fields.
// ===========================================================================

describe("shape-specific fields round-trip", () => {
  it("ellipse keeps width/height/style", () => {
    const restored = roundTripElement({
      ...base("e"),
      type: "ellipse",
      style: { fill: "#abc", roundness: { type: "round" } },
      width: 30,
      height: 40,
    } as unknown as Element);
    const e = restored.elements.get(elementId("e")) as unknown as {
      width: number;
      height: number;
      style: Record<string, unknown>;
    };
    expect(e.width).toBe(30);
    expect(e.height).toBe(40);
    expect(e.style.roundness).toEqual({ type: "round" });
  });

  it("polygon keeps its points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 10 },
      { x: -3, y: 7 },
    ];
    const restored = roundTripElement({
      ...base("p"),
      type: "polygon",
      style: {},
      points,
    } as unknown as Element);
    expect(
      (restored.elements.get(elementId("p")) as unknown as { points: unknown }).points,
    ).toEqual(points);
  });

  it("path keeps all command kinds (M/L/Q/C/Z)", () => {
    const commands = [
      { kind: "M", to: { x: 0, y: 0 } },
      { kind: "L", to: { x: 10, y: 0 } },
      { kind: "Q", control: { x: 15, y: 5 }, to: { x: 10, y: 10 } },
      { kind: "C", control1: { x: 1, y: 1 }, control2: { x: 2, y: 2 }, to: { x: 3, y: 3 } },
      { kind: "Z" },
    ];
    const restored = roundTripElement({
      ...base("path"),
      type: "path",
      style: { stroke: "#000" },
      commands,
    } as unknown as Element);
    expect(
      (restored.elements.get(elementId("path")) as unknown as { commands: unknown }).commands,
    ).toEqual(commands);
  });

  it("brush keeps pressure points (x/y/width)", () => {
    const points = [
      { x: 0, y: 0, width: 1 },
      { x: 5, y: 5, width: 2.5 },
    ];
    const restored = roundTripElement({
      ...base("b"),
      type: "brush",
      style: { stroke: "#111" },
      points,
    } as unknown as Element);
    expect(
      (restored.elements.get(elementId("b")) as unknown as { points: unknown }).points,
    ).toEqual(points);
  });

  it("image keeps src/fileId/animation fields", () => {
    const restored = roundTripElement({
      ...base("img"),
      type: "image",
      style: {},
      src: "blob:x",
      width: 64,
      height: 48,
      fileId: fileId("f-1"),
      animationKind: "lottie",
    } as unknown as Element);
    const im = restored.elements.get(elementId("img")) as unknown as Record<string, unknown>;
    expect(im.src).toBe("blob:x");
    expect(im.fileId).toBe("f-1");
    expect(im.animationKind).toBe("lottie");
  });

  it("template keeps templateId/data/size", () => {
    const restored = roundTripElement({
      ...base("tpl"),
      type: "template",
      style: { fill: "#fff" },
      templateId: "card",
      data: { title: "T", count: 3, nested: { a: 1 } },
      width: 100,
      height: 60,
    } as unknown as Element);
    const t = restored.elements.get(elementId("tpl")) as unknown as Record<string, unknown>;
    expect(t.templateId).toBe("card");
    expect(t.data).toEqual({ title: "T", count: 3, nested: { a: 1 } });
  });

  it("group round-trips with optional style", () => {
    const restored = roundTripElement({
      ...base("g"),
      type: "group",
      style: { opacity: 0.8 },
    });
    expect(restored.elements.get(elementId("g"))?.type).toBe("group");
  });

  it("custom (plugin) shape passes through unknown top-level fields", () => {
    const restored = roundTripElement({
      ...base("c"),
      type: "my-widget",
      style: {},
      customProp: { foo: "bar" },
      radius: 7,
    } as unknown as Element);
    const c = restored.elements.get(elementId("c")) as unknown as Record<string, unknown>;
    expect(c.type).toBe("my-widget");
    expect(c.customProp).toEqual({ foo: "bar" });
    expect(c.radius).toBe(7);
  });
});

// ===========================================================================
// Element base — the optional fields that live on every shape.
// ===========================================================================

describe("element base optional fields round-trip", () => {
  it("preserves size clamps, noFlip, href, parentId, metadata", () => {
    const restored = roundTripElement({
      ...base("x"),
      type: "rectangle",
      style: {},
      width: 10,
      height: 10,
      minWidth: 5,
      minHeight: 6,
      maxWidth: 100,
      maxHeight: 120,
      noFlip: true,
      href: "https://example.com",
      parentId: elementId("parent"),
      metadata: { foo: "bar", n: 42 },
    } as unknown as Element);
    const r = restored.elements.get(elementId("x")) as unknown as Record<string, unknown>;
    expect(r.minWidth).toBe(5);
    expect(r.minHeight).toBe(6);
    expect(r.maxWidth).toBe(100);
    expect(r.maxHeight).toBe(120);
    expect(r.noFlip).toBe(true);
    expect(r.href).toBe("https://example.com");
    expect(r.parentId).toBe("parent");
    expect(r.metadata).toEqual({ foo: "bar", n: 42 });
  });

  it("preserves every anchor-ref kind on `anchors`", () => {
    const anchors = {
      a: { kind: "named", name: "top" },
      b: { kind: "ratio", position: { x: 0.5, y: 0.25 } },
      c: { kind: "absolute", offset: { x: 3, y: 4 } },
      d: { kind: "edge", index: 1, t: 0.5 },
    };
    const restored = roundTripElement({
      ...base("an"),
      type: "rectangle",
      style: {},
      width: 10,
      height: 10,
      anchors,
    } as unknown as Element);
    expect(
      (restored.elements.get(elementId("an")) as unknown as { anchors: unknown }).anchors,
    ).toEqual(anchors);
  });
});

// ===========================================================================
// Links — endpoints + every link field.
// ===========================================================================

describe("link round-trip", () => {
  const sceneWithTwoRects = () => {
    let scene = emptyScene();
    ({ scene } = addElement(scene, rectWith("a", {})));
    ({ scene } = addElement(scene, rectWith("b", {})));
    return scene;
  };

  it("preserves a kitchen-sink link (all fields incl. style.roundness)", () => {
    let scene = sceneWithTwoRects();
    const link: Link = {
      id: linkId("L"),
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
      waypoints: [{ x: 5, y: 5 }],
      routedPoints: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      fixedSegments: [{ axis: "h", pos: 7, at: 3 }],
      routing: "orthogonal",
      arrowheads: { from: "circle", to: "triangle", size: 12 },
      label: { text: "edge", position: 0.4, fontSize: 11, fill: "#000", background: "#fff" },
      order: orderBetween(null, null),
      style: { stroke: "#222", roundness: { type: "round", value: 5 } },
      metadata: { k: "v" },
    } as unknown as Link;
    ({ scene } = addLink(scene, link));
    const restored = deserializeScene(serializeScene(scene));
    const r = restored.links.get(linkId("L")) as unknown as Record<string, unknown>;
    expect(r.waypoints).toEqual([{ x: 5, y: 5 }]);
    expect(r.routedPoints).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(r.fixedSegments).toEqual([{ axis: "h", pos: 7, at: 3 }]);
    expect(r.routing).toBe("orthogonal");
    expect(r.arrowheads).toEqual({ from: "circle", to: "triangle", size: 12 });
    expect(r.label).toEqual({
      text: "edge",
      position: 0.4,
      fontSize: 11,
      fill: "#000",
      background: "#fff",
    });
    expect((r.style as Record<string, unknown>).roundness).toEqual({ type: "round", value: 5 });
    expect(r.metadata).toEqual({ k: "v" });
  });

  it("preserves every endpoint kind", () => {
    let scene = sceneWithTwoRects();
    const mk = (id: string, from: unknown, to: unknown): Link =>
      ({
        id: linkId(id),
        layerId: DEFAULT_LAYER_ID,
        from,
        to,
        order: orderBetween(null, null),
        style: {},
      }) as unknown as Link;
    ({ scene } = addLink(
      scene,
      mk(
        "p",
        { kind: "point", position: { x: 0, y: 0 } },
        { kind: "point", position: { x: 9, y: 9 } },
      ),
    ));
    ({ scene } = addLink(
      scene,
      mk(
        "o",
        { kind: "outline", elementId: elementId("a"), ratio: 0.25 },
        { kind: "floating", elementId: elementId("b") },
      ),
    ));
    const restored = deserializeScene(serializeScene(scene));
    const p = restored.links.get(linkId("p")) as unknown as Record<string, unknown>;
    expect(p.from).toEqual({ kind: "point", position: { x: 0, y: 0 } });
    expect(p.to).toEqual({ kind: "point", position: { x: 9, y: 9 } });
    const o = restored.links.get(linkId("o")) as unknown as Record<string, unknown>;
    expect(o.from).toEqual({ kind: "outline", elementId: "a", ratio: 0.25 });
    expect(o.to).toEqual({ kind: "floating", elementId: "b" });
  });

  it("preserves each routing mode", () => {
    for (const routing of ["straight", "orthogonal", "bezier"] as const) {
      let scene = sceneWithTwoRects();
      const link = {
        id: linkId(`L-${routing}`),
        layerId: DEFAULT_LAYER_ID,
        from: { kind: "point", position: { x: 0, y: 0 } },
        to: { kind: "point", position: { x: 1, y: 1 } },
        routing,
        order: orderBetween(null, null),
        style: {},
      } as unknown as Link;
      ({ scene } = addLink(scene, link));
      const restored = deserializeScene(serializeScene(scene));
      expect(
        (restored.links.get(linkId(`L-${routing}`)) as unknown as { routing: string }).routing,
      ).toBe(routing);
    }
  });
});

// ===========================================================================
// Negative cases — strictness still works, errors are typed.
// ===========================================================================

describe("deserialization errors", () => {
  it("rejects a genuinely unknown style key (strict schema preserved)", () => {
    let scene = emptyScene();
    ({ scene } = addElement(scene, rectWith("r", {})));
    const doc = serializeScene(scene) as unknown as {
      elements: { style: Record<string, unknown> }[];
    };
    doc.elements[0]!.style.totallyBogus = 123;
    expect(() => deserializeScene(doc)).toThrow(DeserializationError);
  });

  it("rejects an unknown top-level document key", () => {
    const scene = emptyScene();
    const doc = serializeScene(scene) as unknown as Record<string, unknown>;
    doc.surpriseField = true;
    expect(() => deserializeScene(doc)).toThrow(DeserializationError);
  });

  it("DeserializationError carries the underlying ZodError as `reason`", () => {
    try {
      deserializeScene({ format: "oh-just-another/scene", version: 1 });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DeserializationError);
      expect((err as DeserializationError).reason).toBeDefined();
    }
  });

  it("rejects a document from a newer version than this build understands", () => {
    const scene = emptyScene();
    const doc = serializeScene(scene) as unknown as { version: number };
    doc.version = 9999;
    expect(() => deserializeScene(doc)).toThrow(DeserializationError);
  });

  it("non-object input throws DeserializationError", () => {
    expect(() => deserializeScene(null)).toThrow(DeserializationError);
    expect(() => deserializeScene(42)).toThrow(DeserializationError);
  });

  it("parseScene throws SyntaxError on malformed JSON", () => {
    expect(() => parseScene("{ not json")).toThrow(SyntaxError);
  });
});
