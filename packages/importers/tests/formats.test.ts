import { describe, expect, it } from "vitest";
import { DEFAULT_LAYER_ID, addElement, emptyScene, orderBetween } from "@oh-just-another/scene";
import { elementId } from "@oh-just-another/types";
import { stringifyScene } from "@oh-just-another/serialization";
import { EXPORT_FORMATS, IMPORT_FORMATS, exportSceneAs, importSceneFrom } from "../src/formats.js";

const sceneWithRect = () => {
  const { scene } = addElement(emptyScene(), {
    id: elementId("r1"),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 10, y: 20 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#abc" },
    width: 100,
    height: 60,
  });
  return scene;
};

describe("diagram format IO", () => {
  it("exposes import formats (incl. import-only) and a narrower export set", () => {
    const importIds = IMPORT_FORMATS.map((f) => f.id);
    const exportIds = EXPORT_FORMATS.map((f) => f.id);
    // Import-only formats appear in import but not export.
    expect(importIds).toEqual(
      expect.arrayContaining(["native", "excalidraw", "mermaid", "jsoncanvas", "dot", "drawio"]),
    );
    expect(exportIds).toEqual(expect.arrayContaining(["native", "excalidraw", "mermaid", "csv"]));
    expect(importIds).not.toContain("csv");
    expect(exportIds).not.toContain("jsoncanvas");
    expect(exportIds).not.toContain("dot");
    expect(exportIds).not.toContain("drawio");
  });

  it("round-trips a scene through the native JSON format", () => {
    const scene = sceneWithRect();
    const { text, filename } = exportSceneAs("native", scene);
    expect(filename).toBe("diagram.oja.json");
    const back = importSceneFrom("native", text);
    // The rectangle survives the round-trip with its geometry intact.
    const el = back.elements.get(elementId("r1"));
    expect(el?.type).toBe("rectangle");
    expect(el?.position).toEqual({ x: 10, y: 20 });
    // Exported text is the same document a direct serialize (with embedded
    // binary files — the file export is self-contained) would produce.
    expect(text).toBe(stringifyScene(scene, 2, { includeFiles: true }));
  });

  it("exports Excalidraw and Mermaid as non-empty strings", () => {
    const scene = sceneWithRect();
    expect(exportSceneAs("excalidraw", scene).text.length).toBeGreaterThan(0);
    expect(exportSceneAs("mermaid", scene).text.length).toBeGreaterThan(0);
    expect(exportSceneAs("excalidraw", scene).filename).toBe("diagram.excalidraw");
  });

  it("throws when exporting an import-only format", () => {
    expect(() => exportSceneAs("jsoncanvas", sceneWithRect())).toThrow(/No exporter/);
  });

  it("throws when importing an unknown format id", () => {
    expect(() => importSceneFrom("nope", "{}")).toThrow(/No importer/);
  });
});
