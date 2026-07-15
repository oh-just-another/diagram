/**
 * B12 (hide half) — per-element hide on the tile-cache path.
 *
 * Tiles are baked WITH `hideElements` applied, and an element entering or
 * leaving the set invalidates exactly the tiles it touches — so the cached
 * bitmaps never show a stale hidden/unhidden shape while unrelated tiles
 * stay cached. Rasterisation runs against a stubbed `OffscreenCanvas`
 * (jsdom has none); what's asserted is the bookkeeping — which shapes a
 * fresh tile bakes and when cached entries are dropped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementId, layerId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type RectangleElement,
  type Scene,
} from "@oh-just-another/scene";
import { InMemoryTileCache, type TileCacheEntry } from "@oh-just-another/renderer-core";
import { renderViaTiles } from "../src/tile-compositor";

const rect = (id: string, x: number, y: number): RectangleElement => ({
  id: elementId(id),
  type: "rectangle",
  layerId: layerId(DEFAULT_LAYER_ID),
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#f00" },
  width: 60,
  height: 40,
});

const sceneWith = (...els: RectangleElement[]): Scene => {
  let s = emptyScene();
  for (const e of els) ({ scene: s } = addElement(s, e));
  return s;
};

/** Minimal OffscreenCanvas stand-in: a noop 2d context via Proxy. */
class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(): unknown {
    return new Proxy(
      { canvas: this },
      { get: (o, k: string) => (k in o ? o[k as keyof typeof o] : () => undefined) },
    );
  }
}

/** Noop main target — compositing goes through drawImage only. */
const mainTarget = new Proxy({} as Record<string, unknown>, {
  get: () => () => undefined,
}) as never;

// Both rects live inside tile (0,0) — TILE_SIZE is 2048 world units.
const A = rect("a", 100, 100);
const B = rect("b", 500, 500);
const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

const compose = (
  scene: Scene,
  cache: InMemoryTileCache<OffscreenCanvas>,
  hide?: ReadonlySet<ReturnType<typeof elementId>>,
): void => {
  renderViaTiles(scene, mainTarget, {
    viewport: VIEWPORT,
    cache,
    zoomBucket: 1,
    ...(hide ? { hideElements: hide } : {}),
  });
};

const tileEntry = (
  cache: InMemoryTileCache<OffscreenCanvas>,
): TileCacheEntry<OffscreenCanvas> | undefined => cache.get({ col: 0, row: 0, zoom: 1 });

describe("renderViaTiles — hideElements", () => {
  beforeEach(() => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a fresh tile bakes without the hidden shape", () => {
    const cache = new InMemoryTileCache<OffscreenCanvas>();
    compose(sceneWith(A, B), cache, new Set([A.id]));
    expect(tileEntry(cache)?.elements).toEqual([B.id]);
  });

  it("hiding a shape invalidates the tiles it touches (rebake without it)", () => {
    const cache = new InMemoryTileCache<OffscreenCanvas>();
    const scene = sceneWith(A, B);
    compose(scene, cache);
    expect(tileEntry(cache)?.elements).toEqual([A.id, B.id]);

    compose(scene, cache, new Set([A.id]));
    expect(tileEntry(cache)?.elements).toEqual([B.id]);
  });

  it("un-hiding restores the shape on the next compose", () => {
    const cache = new InMemoryTileCache<OffscreenCanvas>();
    const scene = sceneWith(A, B);
    compose(scene, cache, new Set([A.id]));
    compose(scene, cache);
    expect(tileEntry(cache)?.elements).toEqual([A.id, B.id]);
  });

  it("an unchanged hide set keeps the cached tile (no rebake)", () => {
    const cache = new InMemoryTileCache<OffscreenCanvas>();
    const scene = sceneWith(A, B);
    const hide = new Set([A.id]);
    compose(scene, cache, hide);
    const first = tileEntry(cache);
    compose(scene, cache, hide);
    expect(tileEntry(cache)).toBe(first);
  });

  it("tiles untouched by the hidden element stay cached across a set change", () => {
    const cache = new InMemoryTileCache<OffscreenCanvas>();
    // C lives in tile (1,0), far from A/B in tile (0,0).
    const C = rect("c", 2100, 100);
    const scene = sceneWith(A, B, C);
    const wide = { x: 0, y: 0, width: 4096, height: 600 };
    renderViaTiles(scene, mainTarget, { viewport: wide, cache, zoomBucket: 1 });
    const farTile = cache.get({ col: 1, row: 0, zoom: 1 });
    expect(farTile).toBeDefined();

    renderViaTiles(scene, mainTarget, {
      viewport: wide,
      cache,
      zoomBucket: 1,
      hideElements: new Set([A.id]),
    });
    // Tile (0,0) rebaked without A; tile (1,0) untouched — same entry object.
    expect(cache.get({ col: 0, row: 0, zoom: 1 })?.elements).toEqual([B.id]);
    expect(cache.get({ col: 1, row: 0, zoom: 1 })).toBe(farTile);
  });
});
