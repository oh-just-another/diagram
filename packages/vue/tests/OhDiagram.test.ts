import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { Scene } from "@oh-just-another/scene";
import { OhDiagram } from "../src/index";

// test-utils mounts off-document, so the custom element never connects and
// no React / WASM render happens — we assert the wrapper's binding contract.
describe("<OhDiagram> (Vue)", () => {
  it("reflects props onto the underlying element's attributes", async () => {
    const wrapper = mount(OhDiagram, {
      props: { theme: "dark", renderer: "webgl2", grid: true },
    });
    const el = wrapper.find("oh-diagram").element;
    expect(el.getAttribute("theme")).toBe("dark");
    expect(el.getAttribute("renderer")).toBe("webgl2");
    expect(el.hasAttribute("grid")).toBe(true);
    expect(el.hasAttribute("snap")).toBe(false);

    await wrapper.setProps({ theme: "light", grid: false });
    expect(el.getAttribute("theme")).toBe("light");
    expect(el.hasAttribute("grid")).toBe(false);
  });

  it("re-emits the element's CustomEvents as Vue events", () => {
    const wrapper = mount(OhDiagram);
    const el = wrapper.find("oh-diagram").element;
    const scene = { schemaVersion: 1 } as unknown as Scene;
    el.dispatchEvent(new CustomEvent("scenechange", { detail: scene }));
    expect(wrapper.emitted("scenechange")?.[0]).toEqual([scene]);
  });

  it("exposes the imperative controller through a ref", () => {
    const wrapper = mount(OhDiagram);
    const exposed = wrapper.vm as unknown as Record<string, unknown>;
    expect(typeof exposed.undo).toBe("function");
    expect(typeof exposed.loadScene).toBe("function");
    expect(typeof exposed.zoomToFit).toBe("function");
  });
});
