import { describe, expect, it } from "vitest";
import { parseScene } from "@oh-just-another/serialization";
import { SceneStore, ToolError } from "../src/store";
import {
  addElements,
  addLinkTool,
  createScene,
  exportPng,
  exportSvg,
  getScene,
  getSceneSchema,
  importMermaid,
  loadScene,
  queryScene,
  removeElements,
  updateElementTool,
} from "../src/tools";

const rect = (x: number, y: number, text?: string) => ({
  type: "rectangle",
  position: { x, y },
  width: 100,
  height: 60,
  ...(text !== undefined ? { metadata: { text } } : {}),
});

describe("scene lifecycle", () => {
  it("create_scene returns a usable sceneId", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    expect(sceneId).toBeTypeOf("string");
    expect(queryScene(store, sceneId).counts).toEqual({ elements: 0, links: 0, layers: 1 });
  });

  it("get_scene / load_scene round-trip", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    addElements(store, sceneId, [rect(10, 10)]);
    const json = getScene(store, sceneId);
    const { sceneId: reloaded } = loadScene(store, json);
    expect(queryScene(store, reloaded).counts.elements).toBe(1);
  });

  it("load_scene rejects invalid documents with a clear error", () => {
    const store = new SceneStore();
    expect(() => loadScene(store, '{"format":"nope"}')).toThrow(ToolError);
    expect(() => loadScene(store, '{"format":"nope"}')).toThrow(/Could not load scene/);
  });

  it("unknown sceneId raises a helpful error", () => {
    const store = new SceneStore();
    expect(() => queryScene(store, "missing")).toThrow(/Unknown sceneId "missing"/);
  });
});

describe("element editing", () => {
  it("create → add → query → export_svg round-trip", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);

    const { ids } = addElements(store, sceneId, [
      rect(0, 0),
      { type: "text", position: { x: 20, y: 20 }, text: "Hello", style: {} },
    ]);
    expect(ids).toHaveLength(2);

    const summary = queryScene(store, sceneId);
    expect(summary.counts.elements).toBe(2);
    expect(summary.elements.map((el) => el.type)).toEqual(["rectangle", "text"]);
    expect(summary.elements[1]?.text).toBe("Hello");
    expect(summary.bounds).not.toBeNull();
    expect(summary.bounds?.width).toBeGreaterThan(0);

    const svg = exportSvg(store, sceneId);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Hello");
  });

  it("applies defaults (width/height/order/layer) to sparse elements", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    const { ids } = addElements(store, sceneId, [{ type: "rectangle" }]);
    const doc = JSON.parse(getScene(store, sceneId)) as {
      elements: { id: string; width: number; height: number; order: string }[];
    };
    expect(doc.elements[0]?.id).toBe(ids[0]);
    expect(doc.elements[0]?.width).toBeGreaterThan(0);
    expect(doc.elements[0]?.height).toBeGreaterThan(0);
    expect(doc.elements[0]?.order).toBeTypeOf("string");
  });

  it("rejects an invalid element with a clear error", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    expect(() => addElements(store, sceneId, [{ type: "rectangle", width: "wide" }])).toThrow(
      /Invalid element data/,
    );
    // Scene untouched after a failed add.
    expect(queryScene(store, sceneId).counts.elements).toBe(0);
  });

  it("update_element patches fields and deep-merges style", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    const { ids } = addElements(store, sceneId, [
      { ...rect(0, 0), style: { fill: "#f00", strokeWidth: 2 } },
    ]);
    const id = ids[0] ?? "";
    updateElementTool(store, sceneId, id, { width: 200, style: { fill: "#0f0" } });
    const doc = JSON.parse(getScene(store, sceneId)) as {
      elements: { width: number; style: { fill: string; strokeWidth: number } }[];
    };
    expect(doc.elements[0]?.width).toBe(200);
    expect(doc.elements[0]?.style.fill).toBe("#0f0");
    expect(doc.elements[0]?.style.strokeWidth).toBe(2);
  });

  it("update_element rejects invalid patches and unknown ids", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    const { ids } = addElements(store, sceneId, [rect(0, 0)]);
    expect(() => updateElementTool(store, sceneId, "nope", {})).toThrow(/Element not found/);
    expect(() => updateElementTool(store, sceneId, ids[0] ?? "", { rotation: "sideways" })).toThrow(
      /Invalid element data/,
    );
  });

  it("remove_elements deletes by id and validates ids", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    const { ids } = addElements(store, sceneId, [rect(0, 0), rect(200, 0)]);
    expect(removeElements(store, sceneId, [ids[0] ?? ""])).toEqual({ removed: 1 });
    expect(queryScene(store, sceneId).counts.elements).toBe(1);
    expect(() => removeElements(store, sceneId, ["nope"])).toThrow(/Element not found/);
  });
});

describe("links", () => {
  it("add_link connects two elements and shows up in query_scene", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    const { ids } = addElements(store, sceneId, [rect(0, 0), rect(300, 0)]);
    const { id } = addLinkTool(store, sceneId, ids[0] ?? "", ids[1] ?? "", "orthogonal", "yes");
    const summary = queryScene(store, sceneId);
    expect(summary.counts.links).toBe(1);
    expect(summary.links[0]).toEqual({ id, from: ids[0], to: ids[1], label: "yes" });
  });

  it("add_link validates endpoint ids", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    const { ids } = addElements(store, sceneId, [rect(0, 0)]);
    expect(() => addLinkTool(store, sceneId, ids[0] ?? "", "ghost")).toThrow(/Element not found/);
  });
});

describe("import / export / schema", () => {
  it("import_mermaid builds a connected scene", () => {
    const store = new SceneStore();
    const { sceneId } = importMermaid(store, "graph TD\nA[Start] --> B[End]\n");
    const summary = queryScene(store, sceneId);
    expect(summary.counts.elements).toBeGreaterThanOrEqual(2);
    expect(summary.counts.links).toBeGreaterThanOrEqual(1);
  });

  it("import_mermaid rejects input with no recognizable nodes", () => {
    const store = new SceneStore();
    expect(() => importMermaid(store, "%% just a comment\n")).toThrow(/no nodes recognized/);
  });

  it("export_png returns base64 PNG bytes", async () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    addElements(store, sceneId, [rect(0, 0)]);
    const base64 = await exportPng(store, sceneId);
    const bytes = Buffer.from(base64, "base64");
    // PNG signature.
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("get_scene_schema matches the serialization schema", () => {
    const schema = getSceneSchema() as { type?: string; properties?: Record<string, unknown> };
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("elements");
    expect(schema.properties).toHaveProperty("links");
  });

  it("exported scene JSON parses back through serialization", () => {
    const store = new SceneStore();
    const { sceneId } = createScene(store);
    addElements(store, sceneId, [rect(0, 0)]);
    expect(() => parseScene(getScene(store, sceneId))).not.toThrow();
  });
});
