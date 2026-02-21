/**
 * Additional coverage for mergeByEntity — focuses on branches not hit by
 * merge.test.ts: link/layer/annotation/file patches, deeply-nested batches,
 * mixed entity kinds, and viewport ordering.
 */
import { describe, expect, it } from "vitest";
import { elementId, linkId, layerId, annotationId, fileId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  DEFAULT_VIEWPORT,
  orderBetween,
  type Element,
  type Patch,
  type Viewport,
} from "@oh-just-another/scene";
import { mergeByEntity } from "../src/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rect = (id: string, x = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 10,
  height: 10,
});

// Minimal link-like object (typed as `never` to satisfy the generic Patch union)
const mkLink = (id: string, label = "L") =>
  ({ id: linkId(id), label }) as unknown as Extract<Patch, { kind: "link" }>["before"];

const mkLayer = (id: string, name = "Layer") =>
  ({ id: layerId(id), name, visible: true, locked: false }) as unknown as Extract<
    Patch,
    { kind: "layer" }
  >["before"];

const mkAnnotation = (id: string) =>
  ({ id: annotationId(id), position: { x: 0, y: 0 }, comments: [] }) as unknown as Extract<
    Patch,
    { kind: "annotation" }
  >["before"];

const mkFile = (id: string) =>
  ({
    id: fileId(id),
    mimeType: "image/png",
    data: new Uint8Array(),
    dataURL: "",
    width: 0,
    height: 0,
    created: 0,
  }) as unknown as Extract<Patch, { kind: "file" }>["before"];

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe("mergeByEntity — empty input", () => {
  it("returns [] for an empty array", () => {
    expect(mergeByEntity([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Link patches
// ---------------------------------------------------------------------------

describe("mergeByEntity — link patches", () => {
  it("single create link is kept as-is", () => {
    const link = mkLink("l1");
    const patch: Patch = { kind: "link", id: linkId("l1"), before: null, after: link };
    const out = mergeByEntity([patch]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(patch);
  });

  it("collapses consecutive link patches for the same id", () => {
    const l0 = mkLink("l1", "A");
    const l1 = mkLink("l1", "B");
    const l2 = mkLink("l1", "C");
    const id = linkId("l1");
    const out = mergeByEntity([
      { kind: "link", id, before: l0, after: l1 },
      { kind: "link", id, before: l1, after: l2 },
    ]);
    expect(out).toEqual([{ kind: "link", id, before: l0, after: l2 }]);
  });

  it("drops link patch that is a round-trip no-op", () => {
    const l0 = mkLink("l1");
    const l1 = mkLink("l1", "B");
    const id = linkId("l1");
    const out = mergeByEntity([
      { kind: "link", id, before: l0, after: l1 },
      { kind: "link", id, before: l1, after: l0 },
    ]);
    expect(out).toEqual([]);
  });

  it("keeps separate entries for different link ids", () => {
    const la = mkLink("la");
    const lb = mkLink("lb");
    const out = mergeByEntity([
      { kind: "link", id: linkId("la"), before: null, after: la },
      { kind: "link", id: linkId("lb"), before: null, after: lb },
    ]);
    expect(out).toHaveLength(2);
  });

  it("preserves first-appearance order for link patches", () => {
    const lb = mkLink("lb");
    const la = mkLink("la");
    const lb2 = mkLink("lb", "moved");
    const out = mergeByEntity([
      { kind: "link", id: linkId("lb"), before: null, after: lb },
      { kind: "link", id: linkId("la"), before: null, after: la },
      { kind: "link", id: linkId("lb"), before: lb, after: lb2 },
    ]);
    expect(out.map((p) => (p.kind === "link" ? String(p.id) : "?"))).toEqual([
      String(linkId("lb")),
      String(linkId("la")),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Layer patches
// ---------------------------------------------------------------------------

describe("mergeByEntity — layer patches", () => {
  it("single create layer is kept", () => {
    const layer = mkLayer("ly1");
    const patch: Patch = { kind: "layer", id: layerId("ly1"), before: null, after: layer };
    const out = mergeByEntity([patch]);
    expect(out).toEqual([patch]);
  });

  it("collapses consecutive layer patches for the same id", () => {
    const l0 = mkLayer("ly1", "A");
    const l1 = mkLayer("ly1", "B");
    const l2 = mkLayer("ly1", "C");
    const id = layerId("ly1");
    const out = mergeByEntity([
      { kind: "layer", id, before: l0, after: l1 },
      { kind: "layer", id, before: l1, after: l2 },
    ]);
    expect(out).toEqual([{ kind: "layer", id, before: l0, after: l2 }]);
  });

  it("drops layer no-op after merge", () => {
    const l0 = mkLayer("ly1");
    const l1 = mkLayer("ly1", "B");
    const id = layerId("ly1");
    const out = mergeByEntity([
      { kind: "layer", id, before: l0, after: l1 },
      { kind: "layer", id, before: l1, after: l0 },
    ]);
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Annotation patches
// ---------------------------------------------------------------------------

describe("mergeByEntity — annotation patches", () => {
  it("single create annotation is kept", () => {
    const ann = mkAnnotation("an1");
    const patch: Patch = { kind: "annotation", id: annotationId("an1"), before: null, after: ann };
    const out = mergeByEntity([patch]);
    expect(out).toEqual([patch]);
  });

  it("collapses consecutive annotation patches for the same id", () => {
    const a0 = mkAnnotation("an1");
    const a1 = { ...mkAnnotation("an1"), position: { x: 10, y: 10 } } as typeof a0;
    const id = annotationId("an1");
    const out = mergeByEntity([
      { kind: "annotation", id, before: a0, after: a1 },
      { kind: "annotation", id, before: a1, after: a0 },
    ]);
    // Merges to before=a0, after=a0 → no-op → dropped
    expect(out).toEqual([]);
  });

  it("keeps separate annotation entries for different ids", () => {
    const a = mkAnnotation("an1");
    const b = mkAnnotation("an2");
    const out = mergeByEntity([
      { kind: "annotation", id: annotationId("an1"), before: null, after: a },
      { kind: "annotation", id: annotationId("an2"), before: null, after: b },
    ]);
    expect(out).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// File patches
// ---------------------------------------------------------------------------

describe("mergeByEntity — file patches", () => {
  it("single create file is kept", () => {
    const f = mkFile("f1");
    const patch: Patch = { kind: "file", id: fileId("f1"), before: null, after: f };
    const out = mergeByEntity([patch]);
    expect(out).toEqual([patch]);
  });

  it("collapses consecutive file patches for the same id", () => {
    const f0 = mkFile("f1");
    const f1 = { ...mkFile("f1"), width: 200 } as typeof f0;
    const f2 = { ...mkFile("f1"), width: 400 } as typeof f0;
    const id = fileId("f1");
    const out = mergeByEntity([
      { kind: "file", id, before: f0, after: f1 },
      { kind: "file", id, before: f1, after: f2 },
    ]);
    expect(out).toEqual([{ kind: "file", id, before: f0, after: f2 }]);
  });

  it("drops file no-op after merge", () => {
    const f0 = mkFile("f1");
    const f1 = { ...mkFile("f1"), width: 200 } as typeof f0;
    const id = fileId("f1");
    const out = mergeByEntity([
      { kind: "file", id, before: f0, after: f1 },
      { kind: "file", id, before: f1, after: f0 },
    ]);
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Viewport patches
// ---------------------------------------------------------------------------

describe("mergeByEntity — viewport patches (extended)", () => {
  it("single viewport patch is kept", () => {
    const v0 = DEFAULT_VIEWPORT;
    const v1: Viewport = { ...v0, pan: { x: 5, y: 5 } };
    const patch: Patch = { kind: "viewport", before: v0, after: v1 };
    const out = mergeByEntity([patch]);
    expect(out).toEqual([patch]);
  });

  it("viewport no-op (before===after reference) is dropped", () => {
    const v0 = DEFAULT_VIEWPORT;
    const out = mergeByEntity([{ kind: "viewport", before: v0, after: v0 }]);
    expect(out).toEqual([]);
  });

  it("three viewport patches collapse to first.before / last.after", () => {
    const v0: Viewport = { ...DEFAULT_VIEWPORT, pan: { x: 0, y: 0 } };
    const v1: Viewport = { ...DEFAULT_VIEWPORT, pan: { x: 10, y: 0 } };
    const v2: Viewport = { ...DEFAULT_VIEWPORT, pan: { x: 20, y: 0 } };
    const v3: Viewport = { ...DEFAULT_VIEWPORT, pan: { x: 30, y: 0 } };
    const out = mergeByEntity([
      { kind: "viewport", before: v0, after: v1 },
      { kind: "viewport", before: v1, after: v2 },
      { kind: "viewport", before: v2, after: v3 },
    ]);
    expect(out).toEqual([{ kind: "viewport", before: v0, after: v3 }]);
  });
});

// ---------------------------------------------------------------------------
// Mixed entity types
// ---------------------------------------------------------------------------

describe("mergeByEntity — mixed entity types", () => {
  it("element, link, layer, annotation, file, viewport together are each kept once", () => {
    const el = rect("a");
    const link = mkLink("l1");
    const layer = mkLayer("ly1");
    const ann = mkAnnotation("an1");
    const f = mkFile("f1");
    const v0 = DEFAULT_VIEWPORT;
    const v1: Viewport = { ...v0, pan: { x: 1, y: 0 } };

    const patches: Patch[] = [
      { kind: "element", id: el.id, before: null, after: el },
      { kind: "link", id: linkId("l1"), before: null, after: link },
      { kind: "layer", id: layerId("ly1"), before: null, after: layer },
      { kind: "annotation", id: annotationId("an1"), before: null, after: ann },
      { kind: "file", id: fileId("f1"), before: null, after: f },
      { kind: "viewport", before: v0, after: v1 },
    ];

    const out = mergeByEntity(patches);
    expect(out).toHaveLength(6);
    expect(out.map((p) => p.kind)).toEqual([
      "element",
      "link",
      "layer",
      "annotation",
      "file",
      "viewport",
    ]);
  });

  it("viewport position in output reflects first-appearance among mixed patches", () => {
    const el = rect("a");
    const v0 = DEFAULT_VIEWPORT;
    const v1: Viewport = { ...v0, pan: { x: 10, y: 0 } };
    const v2: Viewport = { ...v0, pan: { x: 20, y: 0 } };

    // viewport appears between two element patches
    const out = mergeByEntity([
      { kind: "element", id: el.id, before: null, after: el },
      { kind: "viewport", before: v0, after: v1 },
      { kind: "viewport", before: v1, after: v2 },
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe("element");
    expect(out[1]!.kind).toBe("viewport");
    expect(out[1]).toEqual({ kind: "viewport", before: v0, after: v2 });
  });
});

// ---------------------------------------------------------------------------
// Deeply nested batches
// ---------------------------------------------------------------------------

describe("mergeByEntity — nested batch flattening", () => {
  it("handles a batch inside a batch", () => {
    const a = rect("a", 0);
    const a1 = rect("a", 5);
    const a2 = rect("a", 10);

    const inner: Patch = {
      kind: "batch",
      patches: [{ kind: "element", id: a.id, before: a, after: a1 }],
    };
    const outer: Patch = {
      kind: "batch",
      patches: [inner, { kind: "element", id: a.id, before: a1, after: a2 }],
    };

    const out = mergeByEntity([outer]);
    expect(out).toEqual([{ kind: "element", id: a.id, before: a, after: a2 }]);
  });

  it("empty batch contributes nothing", () => {
    const out = mergeByEntity([{ kind: "batch", patches: [] }]);
    expect(out).toEqual([]);
  });

  it("batch containing a viewport merges viewport correctly", () => {
    const v0 = DEFAULT_VIEWPORT;
    const v1: Viewport = { ...v0, pan: { x: 5, y: 0 } };
    const v2: Viewport = { ...v0, pan: { x: 10, y: 0 } };
    const out = mergeByEntity([
      { kind: "batch", patches: [{ kind: "viewport", before: v0, after: v1 }] },
      { kind: "viewport", before: v1, after: v2 },
    ]);
    expect(out).toEqual([{ kind: "viewport", before: v0, after: v2 }]);
  });
});

// ---------------------------------------------------------------------------
// No-op detection for individual entity kinds
// ---------------------------------------------------------------------------

describe("mergeByEntity — no-op detection per entity kind", () => {
  it("single element patch where before===after is dropped", () => {
    const a = rect("a");
    const out = mergeByEntity([{ kind: "element", id: a.id, before: a, after: a }]);
    expect(out).toEqual([]);
  });

  it("single link patch where before===after is dropped", () => {
    const l = mkLink("l1");
    const id = linkId("l1");
    const out = mergeByEntity([{ kind: "link", id, before: l, after: l }]);
    expect(out).toEqual([]);
  });

  it("single layer patch where before===after is dropped", () => {
    const layer = mkLayer("ly1");
    const id = layerId("ly1");
    const out = mergeByEntity([{ kind: "layer", id, before: layer, after: layer }]);
    expect(out).toEqual([]);
  });

  it("single annotation patch where before===after is dropped", () => {
    const ann = mkAnnotation("an1");
    const id = annotationId("an1");
    const out = mergeByEntity([{ kind: "annotation", id, before: ann, after: ann }]);
    expect(out).toEqual([]);
  });

  it("single file patch where before===after is dropped", () => {
    const f = mkFile("f1");
    const id = fileId("f1");
    const out = mergeByEntity([{ kind: "file", id, before: f, after: f }]);
    expect(out).toEqual([]);
  });
});
