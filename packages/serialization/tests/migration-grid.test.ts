import { describe, expect, it } from "vitest";
import { emptyScene } from "@oh-just-another/scene";
import { serializeScene } from "../src/serialize";
import { deserializeScene } from "../src/deserialize";

// Rewrite a current (v2) document into the old v1 shape: drop `gridEnabled`
// and set `gridSize` (the field v1 used for spacing + on/off).
const asV1 = (gridSize: number | undefined): unknown => {
  const doc = JSON.parse(JSON.stringify(serializeScene(emptyScene()))) as {
    version: number;
    viewport: Record<string, unknown>;
  };
  doc.version = 1;
  delete doc.viewport.gridEnabled;
  if (gridSize !== undefined) doc.viewport.gridSize = gridSize;
  return doc;
};

describe("migration v1 → v2 (grid)", () => {
  it("maps a positive gridSize to gridEnabled: true", () => {
    expect(deserializeScene(asV1(20)).viewport.gridEnabled).toBe(true);
  });

  it("maps a zero or absent gridSize to gridEnabled: false", () => {
    expect(deserializeScene(asV1(0)).viewport.gridEnabled).toBe(false);
    expect(deserializeScene(asV1(undefined)).viewport.gridEnabled).toBe(false);
  });
});
