import { describe, it, expect } from "vitest";
import { name } from "../src/index.js";

describe("@oh-just-another/scene", () => {
  it("exports its name", () => {
    expect(name).toBe("@oh-just-another/scene");
  });
});
