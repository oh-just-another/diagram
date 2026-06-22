import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE, emptyScene } from "../src/scene";
import { dehydrateScene, hydrateScene, VIEWPORT_SCOPE } from "../src/hydrate";
import { DEFAULT_VIEWPORT, type Viewport } from "../src/viewport";

describe("hydrateScene", () => {
  it("returns the default settings with no input", () => {
    const s = hydrateScene();
    expect(s.viewport).toEqual(DEFAULT_SCENE.viewport);
    expect(s.layers.size).toBe(1);
    expect(s.elements.size).toBe(0);
  });

  it("applies host settings over the default", () => {
    const s = hydrateScene({ hostSettings: { viewport: { zoom: 2 } } });
    expect(s.viewport.zoom).toBe(2);
    expect(s.viewport.rotation).toBe(DEFAULT_VIEWPORT.rotation);
    expect(s.viewport.pan).toEqual(DEFAULT_VIEWPORT.pan);
  });

  it("persisted user data wins over host settings", () => {
    const s = hydrateScene({
      hostSettings: { viewport: { zoom: 2 } },
      saved: { viewport: { ...DEFAULT_VIEWPORT, zoom: 3 } },
    });
    expect(s.viewport.zoom).toBe(3);
  });

  it("a host setting fills an optional key the persist omits", () => {
    const s = hydrateScene({
      hostSettings: { viewport: { gridStyle: "dots" } },
      saved: { viewport: { ...DEFAULT_VIEWPORT } },
    });
    expect(s.viewport.gridStyle).toBe("dots");
  });

  it("drops unknown setting keys", () => {
    const withBogus = { zoom: 2, bogus: 9 } as unknown as Partial<Viewport>;
    const s = hydrateScene({ hostSettings: { viewport: withBogus } });
    expect(s.viewport.zoom).toBe(2);
    expect((s.viewport as unknown as Record<string, unknown>).bogus).toBeUndefined();
  });

  it("takes entity maps from saved into fresh maps", () => {
    const saved = emptyScene();
    const s = hydrateScene({ saved });
    expect(s.layers).not.toBe(saved.layers);
    expect(s.layers.size).toBe(saved.layers.size);
  });
});

describe("dehydrateScene", () => {
  it("resets ephemeral settings (size) to the default", () => {
    const scene = {
      ...emptyScene(),
      viewport: { ...DEFAULT_VIEWPORT, size: { width: 800, height: 600 } },
    };
    expect(dehydrateScene(scene).viewport.size).toEqual(DEFAULT_VIEWPORT.size);
  });

  it("keeps export-scope settings", () => {
    const scene = {
      ...emptyScene(),
      viewport: { ...DEFAULT_VIEWPORT, gridStyle: "dots" as const },
    };
    expect(dehydrateScene(scene).viewport.gridStyle).toBe("dots");
  });
});

describe("VIEWPORT_SCOPE", () => {
  it("covers every viewport key", () => {
    for (const key of Object.keys(DEFAULT_VIEWPORT)) {
      expect(VIEWPORT_SCOPE).toHaveProperty(key);
    }
  });
});

describe("emptyScene / DEFAULT_SCENE", () => {
  it("emptyScene returns maps independent of DEFAULT_SCENE", () => {
    const s = emptyScene();
    expect(s.elements).not.toBe(DEFAULT_SCENE.elements);
    expect(s.layers).not.toBe(DEFAULT_SCENE.layers);
  });
});
