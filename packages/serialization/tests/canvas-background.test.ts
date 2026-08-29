import { describe, expect, it } from "vitest";
import { emptyScene } from "@oh-just-another/scene";
import { parseScene, stringifyScene } from "../src/index";

describe("viewport.background", () => {
  it("round-trips through the document", () => {
    const scene = emptyScene();
    const withPaper = { ...scene, viewport: { ...scene.viewport, background: "#4a4a4a" } };
    expect(parseScene(stringifyScene(withPaper)).viewport.background).toBe("#4a4a4a");
  });

  it("is absent for documents written before the field existed", () => {
    const parsed = parseScene(stringifyScene(emptyScene()));
    expect("background" in parsed.viewport).toBe(false);
  });
});
