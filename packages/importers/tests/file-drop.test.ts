/**
 * `diagramFileDropHandler`: accepts every importable diagram extension and
 * inserts the parsed scene at the drop point.
 */
import { describe, expect, it, vi } from "vitest";
import { diagramFileDropHandler, IMPORT_FORMATS, importFormatForFile } from "../src/index.js";
import type { Editor } from "@oh-just-another/state";

const file = (name: string, text: string) => new File([text], name, { type: "text/plain" });

describe("diagramFileDropHandler", () => {
  it("advertises every import format and accepts their extensions only", () => {
    expect(diagramFileDropHandler.label).toBe("Diagrams");
    expect(diagramFileDropHandler.formats).toEqual(IMPORT_FORMATS.map((f) => f.label));
    for (const f of IMPORT_FORMATS) {
      for (const ext of f.extensions)
        expect(diagramFileDropHandler.accept(file(`x${ext}`, ""))).toBe(true);
    }
    expect(diagramFileDropHandler.accept(file("photo.png", ""))).toBe(false);
    expect(importFormatForFile("board.oja.json")?.id).toBe("native");
    expect(importFormatForFile("notes.json")?.id).toBe("native");
    expect(importFormatForFile("flow.mmd")?.id).toBe("mermaid");
  });

  it("parses a Mermaid file and inserts it at the drop point", async () => {
    const insertScene = vi.fn();
    const editor = { insertScene } as unknown as Editor;
    await diagramFileDropHandler.handle(file("flow.mmd", "flowchart LR\nA --> B"), {
      editor,
      worldPoint: { x: 10, y: 20 },
    });
    expect(insertScene).toHaveBeenCalledOnce();
    const [scene, at] = insertScene.mock.calls[0]!;
    expect(scene.elements.size).toBe(2);
    expect(scene.links.size).toBe(1);
    expect(at).toEqual({ x: 10, y: 20 });
  });
});
