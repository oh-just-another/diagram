import { describe, expect, it } from "vitest";
import { OH_DIAGRAM_TAG, OhDiagramElement, defineOhDiagram } from "../src/index";

// These exercise the element's DOM contract without connecting it to a live
// document, so no React render / WASM load happens.
describe("<oh-diagram> custom element", () => {
  it("registers the tag on import", () => {
    expect(customElements.get(OH_DIAGRAM_TAG)).toBe(OhDiagramElement);
  });

  it("defineOhDiagram is idempotent", () => {
    expect(() => {
      defineOhDiagram();
    }).not.toThrow();
  });

  it("observes the configuration attributes", () => {
    expect([...OhDiagramElement.observedAttributes]).toEqual(["theme", "renderer", "grid", "snap"]);
  });

  it("reflects the theme property through its attribute", () => {
    const el = document.createElement("oh-diagram");
    el.theme = "dark";
    expect(el.getAttribute("theme")).toBe("dark");
    expect(el.theme).toBe("dark");
    el.theme = null;
    expect(el.hasAttribute("theme")).toBe(false);
    expect(el.theme).toBeNull();
  });

  it("rejects an unknown theme attribute value", () => {
    const el = document.createElement("oh-diagram");
    el.setAttribute("theme", "neon");
    expect(el.theme).toBeNull();
  });

  it("returns inert defaults before mount", () => {
    const el = document.createElement("oh-diagram");
    expect(el.getSelection().size).toBe(0);
    expect(el.getMode()).toBeNull();
    expect(el.getScene()).toBeUndefined();
    expect(el.editor).toBeNull();
    // Imperative calls are no-ops until ready — they must not throw.
    expect(() => {
      el.undo();
      el.redo();
      el.zoomToFit();
    }).not.toThrow();
  });

  it("retains a scene assigned before the editor is ready", () => {
    // A wrapper restoring persisted state on mount sets `scene` before the
    // engine exists. The element must stash it (not drop it) so it can be
    // applied once ready — the actual apply-on-ready path is covered by the
    // mounted example harnesses (manual verification).
    const el = document.createElement("oh-diagram");
    const scene = { schemaVersion: 1 } as unknown as NonNullable<typeof el.scene>;
    el.scene = scene;
    expect(el.scene).toBe(scene);
  });
});
