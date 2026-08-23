/**
 * `floatPanel` keeps a panel invisible until its first position resolves,
 * so floating chrome never paints at (0, 0) before jumping into place.
 */
import { afterEach, describe, expect, it } from "vitest";
import { floatPanel } from "../src/primitives/float-panel";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("floatPanel", () => {
  it("hides the panel until the first computePosition lands, then reveals it in place", async () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    const stop = floatPanel(anchor, panel, {
      placement: "bottom-start",
      padding: 8,
      strategy: "fixed",
    });
    expect(panel.style.visibility).toBe("hidden");
    await new Promise((r) => setTimeout(r, 0));
    expect(panel.style.visibility).toBe("");
    expect(panel.style.transform).toMatch(/^translate\(/);
    stop();
  });
});
