import { describe, it, expect } from "vitest";
import { name } from "../src/index";

describe("@oh-just-another/react-ui", () => {
  it("exports its name", () => {
    expect(name).toBe("@oh-just-another/react-ui");
  });
});
