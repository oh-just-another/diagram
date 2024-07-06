import { describe, it, expect } from "vitest";
import { name } from "../src/index";

describe("@oh-just-another/importers", () => {
  it("exports its name", () => {
    expect(name).toBe("@oh-just-another/importers");
  });
});
