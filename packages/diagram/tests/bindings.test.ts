import { describe, expect, it, vi } from "vitest";
import type { Scene } from "@oh-just-another/scene";
import "../src/index"; // side effect: registers <oja-diagram>
import {
  applyOjaDiagramProps,
  bindOjaDiagramEvents,
  OJA_DIAGRAM_EVENTS,
  ojaDiagramController,
} from "../src/bindings";
import type { OjaDiagramElement } from "../src/oja-diagram-element";

// A bare `<oja-diagram>` is never connected here, so no React / WASM mount
// happens — these exercise the pure attribute / property / event plumbing.
const makeEl = (): OjaDiagramElement => document.createElement("oja-diagram");

describe("applyOjaDiagramProps", () => {
  it("maps scalars to attributes and the scene to the property", () => {
    const el = makeEl();
    const scene = { schemaVersion: 1 } as unknown as Scene;
    applyOjaDiagramProps(el, { theme: "dark", renderer: "webgl2", grid: true, snap: true, scene });
    expect(el.getAttribute("theme")).toBe("dark");
    expect(el.getAttribute("renderer")).toBe("webgl2");
    expect(el.hasAttribute("grid")).toBe(true);
    expect(el.hasAttribute("snap")).toBe(true);
    expect(el.scene).toBe(scene);
  });

  it("clears attributes when a prop is absent (wrapper owns the element)", () => {
    const el = makeEl();
    applyOjaDiagramProps(el, { theme: "light", grid: true });
    applyOjaDiagramProps(el, {});
    expect(el.hasAttribute("theme")).toBe(false);
    expect(el.hasAttribute("grid")).toBe(false);
    expect(el.hasAttribute("snap")).toBe(false);
  });
});

describe("bindOjaDiagramEvents", () => {
  it("invokes handlers with the unwrapped detail and unbinds cleanly", () => {
    const el = makeEl();
    const scenechange = vi.fn();
    const unbind = bindOjaDiagramEvents(el, { scenechange });

    const scene = { schemaVersion: 1 } as unknown as Scene;
    el.dispatchEvent(new CustomEvent("scenechange", { detail: scene }));
    expect(scenechange).toHaveBeenCalledWith(scene);

    unbind();
    el.dispatchEvent(new CustomEvent("scenechange", { detail: scene }));
    expect(scenechange).toHaveBeenCalledTimes(1);
  });

  it("only subscribes to events with a handler", () => {
    const el = makeEl();
    const ready = vi.fn();
    bindOjaDiagramEvents(el, { ready });
    el.dispatchEvent(new CustomEvent("themechange", { detail: "dark" }));
    expect(ready).not.toHaveBeenCalled();
  });

  it("exposes the four documented event types", () => {
    expect([...OJA_DIAGRAM_EVENTS]).toEqual([
      "ready",
      "scenechange",
      "selectionchange",
      "themechange",
    ]);
  });
});

describe("ojaDiagramController", () => {
  it("delegates to the current element and stays inert when absent", () => {
    let el: OjaDiagramElement | null = null;
    const controller = ojaDiagramController(() => el);
    expect(controller.getScene()).toBeUndefined();
    expect(controller.getMode()).toBeNull();
    expect(controller.getSelection().size).toBe(0);
    expect(() => {
      controller.undo();
      controller.redo();
      controller.zoomToFit();
    }).not.toThrow();

    el = makeEl();
    expect(controller.getSelection().size).toBe(0);
  });
});
