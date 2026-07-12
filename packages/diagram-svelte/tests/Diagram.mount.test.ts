// @vitest-environment jsdom
/**
 * Mounts `<Diagram>` for real (Svelte 5 `mount`) so the wrapper's runtime
 * wiring — prop application, event re-dispatch, exported controller — is
 * executed against a live `<oja-diagram>` element. React is mocked out
 * inside the custom element (`createRoot` returns spies), so no editor
 * boots in jsdom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import type { Scene } from "@oh-just-another/scene";

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }),
}));

// jsdom has no constructable stylesheets; the element only calls replaceSync.
class FakeCSSStyleSheet {
  replaceSync = vi.fn();
}

import type { OjaDiagramElement } from "@oh-just-another/diagram";
import Diagram from "../src/Diagram.svelte";

interface MountedDiagram {
  getScene: () => Scene | undefined;
  loadScene: (scene: Scene) => void;
  undo: () => void;
  redo: () => void;
  zoomToFit: () => void;
  getActiveTool: () => string | null;
  setActiveTool: (mode: string) => void;
  getSelection: () => ReadonlySet<string>;
  setSelection: (ids: Iterable<string>) => void;
}

let target: HTMLElement;

beforeEach(() => {
  vi.stubGlobal("CSSStyleSheet", FakeCSSStyleSheet);
  target = document.createElement("div");
  document.body.appendChild(target);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const mountDiagram = (
  props: Record<string, unknown> = {},
): { api: MountedDiagram; el: OjaDiagramElement; destroy: () => void } => {
  const api = mount(Diagram, { target, props }) as unknown as MountedDiagram;
  flushSync();
  const el = target.querySelector("oja-diagram") as OjaDiagramElement;
  return {
    api,
    el,
    destroy: () => {
      unmount(Diagram as never, { outro: false });
    },
  };
};

describe("<Diagram> mount", () => {
  it("renders an <oja-diagram> element that fills its host", () => {
    const { el } = mountDiagram();
    expect(el).not.toBeNull();
    expect(el.style.width).toBe("100%");
    expect(el.style.height).toBe("100%");
  });

  it("applies declarative props to the element", () => {
    const scene = { schemaVersion: 1 } as unknown as Scene;
    const { el } = mountDiagram({
      scene,
      theme: "dark",
      renderer: "webgl2",
      grid: true,
      snap: true,
    });
    expect(el.getAttribute("theme")).toBe("dark");
    expect(el.getAttribute("renderer")).toBe("webgl2");
    expect(el.hasAttribute("grid")).toBe(true);
    expect(el.hasAttribute("snap")).toBe(true);
  });

  it("defaults grid/snap off and leaves theme/renderer unset", () => {
    const { el } = mountDiagram();
    expect(el.hasAttribute("grid")).toBe(false);
    expect(el.hasAttribute("snap")).toBe(false);
    expect(el.hasAttribute("theme")).toBe(false);
    expect(el.hasAttribute("renderer")).toBe(false);
  });

  it("re-emits the element CustomEvents through callback props", () => {
    const onscenechange = vi.fn();
    const onthemechange = vi.fn();
    const { el } = mountDiagram({ onscenechange, onthemechange });

    const scene = { schemaVersion: 1 } as unknown as Scene;
    el.dispatchEvent(new CustomEvent("scenechange", { detail: scene }));
    el.dispatchEvent(new CustomEvent("themechange", { detail: "dark" }));

    expect(onscenechange).toHaveBeenCalledExactlyOnceWith(scene);
    expect(onthemechange).toHaveBeenCalledExactlyOnceWith("dark");
  });

  it("exposes the imperative controller through component exports", () => {
    const { api, el } = mountDiagram();
    const undo = vi.spyOn(el, "undo");
    const redo = vi.spyOn(el, "redo");
    const zoomToFit = vi.spyOn(el, "zoomToFit");
    const setActiveTool = vi.spyOn(el, "setActiveTool");

    api.undo();
    api.redo();
    api.zoomToFit();
    api.setActiveTool("select");

    expect(undo).toHaveBeenCalledOnce();
    expect(redo).toHaveBeenCalledOnce();
    expect(zoomToFit).toHaveBeenCalledOnce();
    expect(setActiveTool).toHaveBeenCalledExactlyOnceWith("select");
    // Before the editor is ready the element returns inert defaults.
    expect(api.getActiveTool()).toBeNull();
    expect(api.getSelection().size).toBe(0);
    expect(api.getScene()).toBeUndefined();
  });

  it("loadScene forwards to the element", () => {
    const { api, el } = mountDiagram();
    const loadScene = vi.spyOn(el, "loadScene");
    const scene = { schemaVersion: 1 } as unknown as Scene;
    api.loadScene(scene);
    expect(loadScene).toHaveBeenCalledExactlyOnceWith(scene);
  });
});
