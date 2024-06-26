import { describe, it, expect } from "vitest";
import { name } from "../src/index.js";

describe("@oh-just-another/history", () => {
  it("exports its name", () => {
    expect(name).toBe("@oh-just-another/history");
  });
});
