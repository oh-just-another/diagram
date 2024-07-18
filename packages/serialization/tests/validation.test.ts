import { describe, expect, it } from "vitest";
import { DeserializationError, deserializeScene, parseScene } from "../src/index";

const validBaseDoc = {
  format: "oh-just-another/scene",
  version: 1,
  shapes: [],
  edges: [],
  layers: [
    {
      id: "default",
      name: "Default",
      visible: true,
      locked: false,
      order: "a0",
    },
  ],
  viewport: {
    pan: { x: 0, y: 0 },
    zoom: 1,
    rotation: 0,
    size: { width: 0, height: 0 },
  },
};

describe("validation", () => {
  it("accepts a minimal valid document", () => {
    expect(() => deserializeScene(validBaseDoc)).not.toThrow();
  });

  it("rejects non-objects", () => {
    expect(() => deserializeScene(null)).toThrow(DeserializationError);
    expect(() => deserializeScene("not-a-doc")).toThrow(DeserializationError);
  });

  it("rejects wrong format", () => {
    expect(() => deserializeScene({ ...validBaseDoc, format: "something-else" })).toThrow(
      DeserializationError,
    );
  });

  it("rejects shape without required fields", () => {
    expect(() =>
      deserializeScene({
        ...validBaseDoc,
        shapes: [{ id: "a" /* missing everything else */ }],
      }),
    ).toThrow(DeserializationError);
  });

  it("rejects documents with version newer than this build", () => {
    expect(() => deserializeScene({ ...validBaseDoc, version: 999 })).toThrow(
      /newer than this build/,
    );
  });

  it("parseScene reports JSON syntax errors via SyntaxError", () => {
    expect(() => parseScene("{not json}")).toThrow(SyntaxError);
  });

  it("parseScene reports invalid-content as an error", () => {
    // Empty `{}` has no version → migration to v1 fails (MissingMigrationError).
    expect(() => parseScene("{}")).toThrow();
    // Well-versioned but malformed → DeserializationError.
    expect(() => parseScene('{"version": 1, "format": "x"}')).toThrow(DeserializationError);
  });
});
