import { describe as viDescribe, expect, it } from "vitest";
import { elementId, linkId, layerId, annotationId, fileId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  DEFAULT_VIEWPORT,
  orderBetween,
  type Element,
  type Patch,
} from "@oh-just-another/scene";
import { describe } from "../src/describe.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rect = (id: string, overrides: Partial<Element> = {}): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#000" },
    width: 10,
    height: 10,
    ...overrides,
  }) as Element;

const mkLink = (id: string) => ({
  id: linkId(id),
  kind: "straight" as const,
  sourceElementId: elementId("a"),
  targetElementId: elementId("b"),
});

const mkLayer = (id: string) => ({
  id: layerId(id),
  name: "Layer 1",
  visible: true,
  locked: false,
});

const mkAnnotation = (id: string) => ({
  id: annotationId(id),
  position: { x: 0, y: 0 },
  comments: [],
});

const mkFile = (id: string) => ({
  id: fileId(id),
  mimeType: "image/png",
  data: new Uint8Array([1, 2, 3]),
  dataURL: "data:image/png;base64,AAAA",
  width: 100,
  height: 100,
  created: 0,
});

// ---------------------------------------------------------------------------
// element patches
// ---------------------------------------------------------------------------

viDescribe("describe — element patches", () => {
  it("create element with known type → 'Create Rectangle'", () => {
    const el = rect("a");
    const patch: Patch = { kind: "element", id: el.id, before: null, after: el };
    expect(describe(patch)).toBe("Create Rectangle");
  });

  it("create element with lowercase type → titlecased", () => {
    const el = rect("a", { type: "ellipse" });
    const patch: Patch = { kind: "element", id: el.id, before: null, after: el };
    expect(describe(patch)).toBe("Create Ellipse");
  });

  it("create element with null after → 'Create shape'", () => {
    const patch: Patch = { kind: "element", id: elementId("a"), before: null, after: null };
    expect(describe(patch)).toBe("Create shape");
  });

  it("delete element with known type → 'Delete Rectangle'", () => {
    const el = rect("a");
    const patch: Patch = { kind: "element", id: el.id, before: el, after: null };
    expect(describe(patch)).toBe("Delete Rectangle");
  });

  it("delete element with null before → 'Delete shape'", () => {
    const patch: Patch = { kind: "element", id: elementId("a"), before: null, after: null };
    // before=null and after=null → create path, but after is also null → labelForCreate(null)
    expect(describe(patch)).toBe("Create shape");
  });

  it("update element: position changed → 'Move Rectangle'", () => {
    const before = rect("a", { position: { x: 0, y: 0 } });
    const after = rect("a", { position: { x: 10, y: 0 } });
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Move Rectangle");
  });

  it("update element: y position changed → 'Move Rectangle'", () => {
    const before = rect("a", { position: { x: 0, y: 0 } });
    const after = rect("a", { position: { x: 0, y: 5 } });
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Move Rectangle");
  });

  it("update element: width changed → 'Resize Rectangle'", () => {
    const before = rect("a", { width: 10 });
    const after = rect("a", { width: 20 });
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Resize Rectangle");
  });

  it("update element: height changed → 'Resize Rectangle'", () => {
    const before = rect("a", { height: 10 });
    const after = rect("a", { height: 20 });
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Resize Rectangle");
  });

  it("update element: size + position both changed → 'Resize Rectangle'", () => {
    const before = rect("a", { width: 10, position: { x: 0, y: 0 } });
    const after = rect("a", { width: 20, position: { x: 5, y: 5 } });
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Resize Rectangle");
  });

  it("update element: rotation changed → 'Rotate Rectangle'", () => {
    const before = rect("a", { rotation: 0 });
    const after = rect("a", { rotation: 45 });
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Rotate Rectangle");
  });

  it("update element: scale changed → 'Scale Rectangle'", () => {
    const before = rect("a", { scale: { x: 1, y: 1 } });
    const after = rect("a", { scale: { x: 2, y: 1 } });
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Scale Rectangle");
  });

  it("update element: scale y changed → 'Scale Rectangle'", () => {
    const before = rect("a", { scale: { x: 1, y: 1 } });
    const after = rect("a", { scale: { x: 1, y: 2 } });
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Scale Rectangle");
  });

  it("update element: text changed → 'Edit Rectangle'", () => {
    const before = { ...rect("a"), text: "hello" };
    const after = { ...rect("a"), text: "world" };
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Edit Rectangle");
  });

  it("update element: nothing changed → 'Update Rectangle'", () => {
    const before = rect("a");
    const after = { ...rect("a"), style: { fill: "#fff" } };
    const patch: Patch = { kind: "element", id: before.id, before, after };
    expect(describe(patch)).toBe("Update Rectangle");
  });

  it("update element: unknown type → 'Update shape'", () => {
    // type is a non-string to exercise the fallback path
    const before = { ...rect("a"), type: 42 as unknown as string };
    const after = { ...rect("a"), type: 42 as unknown as string };
    const patch: Patch = { kind: "element", id: elementId("a"), before, after };
    expect(describe(patch)).toBe("Update shape");
  });

  it("update element: before has no position → no position change detected", () => {
    const before = { ...rect("a"), position: undefined as unknown as { x: number; y: number } };
    const after = rect("a", { position: { x: 5, y: 5 } });
    const patch: Patch = { kind: "element", id: elementId("a"), before, after };
    // positionChanged requires both before.position and after.position to exist
    expect(describe(patch)).toBe("Update Rectangle");
  });

  it("update element: before has no scale → no scale change detected", () => {
    const before = { ...rect("a"), scale: undefined as unknown as { x: number; y: number } };
    const after = rect("a", { scale: { x: 2, y: 2 } });
    const patch: Patch = { kind: "element", id: elementId("a"), before, after };
    // scaleChanged requires both before.scale and after.scale
    expect(describe(patch)).toBe("Update Rectangle");
  });
});

// ---------------------------------------------------------------------------
// link patches
// ---------------------------------------------------------------------------

viDescribe("describe — link patches", () => {
  it("create link → 'Create edge'", () => {
    const link = mkLink("l1");
    const patch: Patch = { kind: "link", id: link.id, before: null, after: link as never };
    expect(describe(patch)).toBe("Create edge");
  });

  it("delete link → 'Delete edge'", () => {
    const link = mkLink("l1");
    const patch: Patch = { kind: "link", id: link.id, before: link as never, after: null };
    expect(describe(patch)).toBe("Delete edge");
  });

  it("update link → 'Update edge'", () => {
    const link = mkLink("l1");
    const patch: Patch = { kind: "link", id: link.id, before: link as never, after: link as never };
    expect(describe(patch)).toBe("Update edge");
  });
});

// ---------------------------------------------------------------------------
// layer patches
// ---------------------------------------------------------------------------

viDescribe("describe — layer patches", () => {
  it("create layer → 'Create layer'", () => {
    const layer = mkLayer("ly1");
    const patch: Patch = { kind: "layer", id: layer.id, before: null, after: layer as never };
    expect(describe(patch)).toBe("Create layer");
  });

  it("delete layer → 'Delete layer'", () => {
    const layer = mkLayer("ly1");
    const patch: Patch = { kind: "layer", id: layer.id, before: layer as never, after: null };
    expect(describe(patch)).toBe("Delete layer");
  });

  it("update layer → 'Update layer'", () => {
    const layer = mkLayer("ly1");
    const patch: Patch = {
      kind: "layer",
      id: layer.id,
      before: layer as never,
      after: layer as never,
    };
    expect(describe(patch)).toBe("Update layer");
  });
});

// ---------------------------------------------------------------------------
// annotation patches
// ---------------------------------------------------------------------------

viDescribe("describe — annotation patches", () => {
  it("create annotation → 'Add comment'", () => {
    const ann = mkAnnotation("an1");
    const patch: Patch = { kind: "annotation", id: ann.id, before: null, after: ann as never };
    expect(describe(patch)).toBe("Add comment");
  });

  it("delete annotation → 'Delete comment'", () => {
    const ann = mkAnnotation("an1");
    const patch: Patch = { kind: "annotation", id: ann.id, before: ann as never, after: null };
    expect(describe(patch)).toBe("Delete comment");
  });

  it("update annotation → 'Update comment'", () => {
    const ann = mkAnnotation("an1");
    const patch: Patch = {
      kind: "annotation",
      id: ann.id,
      before: ann as never,
      after: ann as never,
    };
    expect(describe(patch)).toBe("Update comment");
  });
});

// ---------------------------------------------------------------------------
// viewport patches
// ---------------------------------------------------------------------------

viDescribe("describe — viewport patches", () => {
  it("viewport patch → 'Camera change'", () => {
    const patch: Patch = { kind: "viewport", before: DEFAULT_VIEWPORT, after: DEFAULT_VIEWPORT };
    expect(describe(patch)).toBe("Camera change");
  });
});

// ---------------------------------------------------------------------------
// file patches
// ---------------------------------------------------------------------------

viDescribe("describe — file patches", () => {
  it("create file → 'Add file'", () => {
    const f = mkFile("f1");
    const patch: Patch = { kind: "file", id: f.id, before: null, after: f as never };
    expect(describe(patch)).toBe("Add file");
  });

  it("delete file → 'Remove file'", () => {
    const f = mkFile("f1");
    const patch: Patch = { kind: "file", id: f.id, before: f as never, after: null };
    expect(describe(patch)).toBe("Remove file");
  });

  it("update file → 'Update file'", () => {
    const f = mkFile("f1");
    const patch: Patch = { kind: "file", id: f.id, before: f as never, after: f as never };
    expect(describe(patch)).toBe("Update file");
  });
});

// ---------------------------------------------------------------------------
// batch patches
// ---------------------------------------------------------------------------

viDescribe("describe — batch patches", () => {
  it("empty batch → 'Empty batch'", () => {
    const patch: Patch = { kind: "batch", patches: [] };
    expect(describe(patch)).toBe("Empty batch");
  });

  it("single-element batch unwraps to the inner label", () => {
    const el = rect("a");
    const inner: Patch = { kind: "element", id: el.id, before: null, after: el };
    const patch: Patch = { kind: "batch", patches: [inner] };
    expect(describe(patch)).toBe("Create Rectangle");
  });

  it("batch where all inner patches have the same label → plural label", () => {
    const a = rect("a");
    const b = rect("b");
    const patch: Patch = {
      kind: "batch",
      patches: [
        { kind: "element", id: a.id, before: null, after: a },
        { kind: "element", id: b.id, before: null, after: b },
      ],
    };
    expect(describe(patch)).toBe("Create Rectangle (×2)");
  });

  it("batch with 3 homogeneous patches → (×3) suffix", () => {
    const els = ["a", "b", "c"].map((id) => rect(id));
    const patch: Patch = {
      kind: "batch",
      patches: els.map((el) => ({ kind: "element" as const, id: el.id, before: null, after: el })),
    };
    expect(describe(patch)).toBe("Create Rectangle (×3)");
  });

  it("batch with mixed-kind patches → '<n> changes'", () => {
    const el = rect("a");
    const link = mkLink("l1");
    const patch: Patch = {
      kind: "batch",
      patches: [
        { kind: "element", id: el.id, before: null, after: el },
        { kind: "link", id: link.id, before: null, after: link as never },
      ],
    };
    expect(describe(patch)).toBe("2 changes");
  });

  it("batch with mixed-operation patches (create + move) → '<n> changes'", () => {
    const a = rect("a");
    const b = rect("b");
    const bMoved = rect("b", { position: { x: 100, y: 0 } });
    const patch: Patch = {
      kind: "batch",
      patches: [
        { kind: "element", id: a.id, before: null, after: a },
        { kind: "element", id: b.id, before: b, after: bMoved },
      ],
    };
    expect(describe(patch)).toBe("2 changes");
  });

  it("nested batch — single inner batch containing a single element unwraps recursively", () => {
    const el = rect("a");
    const inner: Patch = { kind: "element", id: el.id, before: null, after: el };
    const patch: Patch = {
      kind: "batch",
      patches: [{ kind: "batch", patches: [inner] }],
    };
    // outer batch has 1 patch → unwraps to inner batch → 1 patch → unwraps to element
    expect(describe(patch)).toBe("Create Rectangle");
  });
});
