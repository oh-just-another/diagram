# @oh-just-another/renderer-core

Backend-agnostic render kernel: turns a `Scene` into draw calls against an abstract surface.

L1 layer. Isomorphic — no DOM and no Node APIs, so it runs unchanged in the browser, a worker, or on a server. Depends only on `@oh-just-another/types`, `@oh-just-another/math`, `@oh-just-another/scene`. Concrete backends (Canvas2D, SVG, WebGPU, …) implement the `RenderTarget` interface and live in sibling packages.

## Quick start

```ts
import {
  renderScene,
  registerElementRenderer,
  installBuiltinRenderers,
} from "@oh-just-another/renderer-core";

// Register draw functions for the built-in element types (idempotent).
installBuiltinRenderers();

// Or register your own for a custom type — draws in the element's local space.
registerElementRenderer("rectangle", (element, target) => {
  target.beginPath();
  target.rect(0, 0, element.width, element.height);
  if (element.style.fill) {
    target.setFill(element.style.fill);
    target.fill();
  }
});

// `target` is any RenderTarget implementation supplied by a backend.
renderScene(scene, target);
```

## API & concepts

### Render target

| Name                                                                                            | Purpose                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RenderTarget`                                                                                  | Abstract drawing surface: paths, style, transform, state stack, text, image, clear. A backend implements it; the contract maps closely to Canvas2D for native fidelity. |
| `FillRule`, `LineCap`, `LineJoin`, `TextAlign`, `TextBaseline`, `FontStyleOptions`, `DrawPoint` | Style and geometry types used by `RenderTarget` calls.                                                                                                                  |

### Element-renderer registry

| Name                                                                  | Purpose                                                                                                                                  |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ElementRenderer`, `ElementRenderContext`                             | An element's draw function and the context (target, lod, helpers) it receives. Renderers draw in the element's _local_ coordinate space. |
| `registerElementRenderer`, `getElementRenderer`, `hasElementRenderer` | Register / look up / probe a renderer by element type.                                                                                   |
| `installBuiltinRenderers`                                             | Registers backend-agnostic renderers for all built-in element types. Safe to call repeatedly.                                            |

### Scene, links & grid walkers

| Name                                                                           | Purpose                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderScene`, `RenderSceneOptions`, `LodOptions`                              | Top-level walker: per visible layer (bottom → top) and per element (z-order), applies the viewport transform, pushes the element's local TRS, invokes its renderer. Supports level-of-detail and unknown-element handling. |
| `renderLinks`, `RenderLinksOptions`, `strokeRoundedPolyline`                   | Draw connector links; `strokeRoundedPolyline` strokes a polyline with rounded corners.                                                                                                                                     |
| `renderGrid`, `computeGridRungs`, `RenderGridOptions`, `GridLevel`, `GridRung` | Draw the background grid; `computeGridRungs` derives the visible subdivision levels for the current zoom.                                                                                                                  |
| `LAYER_ORDER`, `LayerName`                                                     | Canonical layer ordering (`background` / `main` / `overlay`).                                                                                                                                                              |

### Caches

| Name                                                                 | Purpose                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| `LruCache`                                                           | Generic byte-budgeted LRU used by the bitmap/tile caches. |
| `ElementCache`, `sharedBoundsCache`, `cachedWorldBounds`             | Per-element world-bounds caching.                         |
| `ElementBitmapCache`, `InMemoryElementBitmapCache`, `zoomBucket`     | Cache rasterized element bitmaps, keyed by zoom bucket.   |
| `LinkBitmapCache`, `InMemoryLinkBitmapCache`                         | Cache rasterized link bitmaps.                            |
| `LayerCompositeCache`, `InMemoryLayerCompositeCache`                 | Cache composited whole-layer bitmaps.                     |
| `LinkBoundsCache`, `sharedLinkBoundsCache`, `computeLinkWorldBounds` | Per-link world-bounds caching.                            |

The cache _interfaces_ are backend-agnostic; the `InMemory*` classes are default implementations that hold opaque bitmap handles.

### Text layout & editing

| Name                                                                                     | Purpose                                                   |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `wrapText`, `WrapOptions`, `WrappedLine`                                                 | Word-wrap text to a width budget.                         |
| `layoutText`, `LayoutTextOptions`, `LaidOutLine`, `EditableTextLayout`, `MeasureText`    | Lay out multi-line editable text from a measure callback. |
| `caretGeometry`, `pointToCaretIndex`, `selectionRects`, `CaretGeometry`, `SelectionRect` | Caret and selection geometry for text editing.            |
| `DEFAULT_LINE_HEIGHT_FACTOR`                                                             | Default line-height multiplier.                           |

### Shaper & rasterizer registries

| Name                                                                                    | Purpose                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TextShaper`, `ShaperFont`, `ShapedGlyph`, `setActiveTextShaper`, `getActiveTextShaper` | Pluggable text-shaping interface and its active-instance registry. The default path uses the host's measure callback; a host can install a richer shaping engine (e.g. a WASM shaper) for correct ligatures and complex scripts. |
| `Rasterizer`, `setActiveRasterizer`, `getActiveRasterizer`, `jsRasterizer`              | Pluggable path rasterizer with a pure-JS default; a host can swap in a faster backend.                                                                                                                                           |

### Tile & worker rendering

| Name                                                                   | Purpose                                                                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `TileCache`, `TileKey`, `TileCacheEntry`, `InMemoryTileCache`          | Tiled rendering: cache fixed-size tiles keyed by position and zoom.                                             |
| `TILE_SIZE`, `MAX_TILE_CACHE_BYTES`, `LOD_THRESHOLD`                   | Tile size (2048 px), cache byte budget, and the scale below which low-detail rendering kicks in.                |
| `WorkerRenderMessage`, `WorkerRenderResponse`, `WORKER_AUTO_THRESHOLD` | Message protocol for off-main-thread rendering; renders auto-route to a worker above 5000 elements.             |
| `fetchModuleBytes`, `allocBytes`, `WasmArena`                          | Helpers for loading WASM module bytes and allocating into a shared arena (for WASM shaper/rasterizer backends). |

### Animated content

| Name                                                                                                                           | Purpose                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `AnimatedSourceAdapter`, `registerAnimationAdapter`, `unregisterAnimationAdapter`, `getAnimationAdapter`, `listAnimationKinds` | Registry of adapters that resolve animated sources (e.g. video, animated images) by kind.    |
| `resolveImageSource`                                                                                                           | Resolve an element's image source to a drawable frame for the current clock time.            |
| `setAnimationClock`, `resetAnimationClock`                                                                                     | Override / reset the clock driving animation frames (deterministic in headless renders).     |
| `onAnimationContentReady`, `notifyAnimationContentReady`                                                                       | Subscribe to / signal that async animation content became available, to trigger a re-render. |

### Constants

`DEFAULT_LOD`, `DEFAULT_PLACEHOLDER_FILL`, `VIEWPORT_CULL_PADDING_RATIO`, `LINK_CORNER_RADIUS`, and the grid tunables (`GRID_LINE_COLOR`, `GRID_DOT_FILL`, `GRID_LINE_WIDTH_PX`, `GRID_DOT_RADIUS_PX`, `GRID_MIN_SCREEN_SPACING_PX`, `GRID_LEVEL_SUBDIV`, `GRID_LEVEL_RUNGS`, `GRID_LINE_FADE_FROM_PX`, `GRID_LINE_FADE_FULL_PX`, `GRID_DOT_FADE_FROM_PX`, `GRID_DOT_FADE_FULL_PX`) are exported for hosts that need to tune rendering.

## Design notes

- The `RenderTarget` contract is deliberately close to Canvas2D so a backend can map calls one-to-one, yet it is abstract enough that an SVG or GPU backend can implement the same surface.
- Shaper and rasterizer are global singletons (`setActive*`) rather than per-call parameters: a process picks one text/raster backend at startup, and every renderer reads from the active one.
- Caches expose interfaces separate from their in-memory defaults so a host can plug in a different storage strategy (e.g. budgeted off-heap bitmaps) without changing the walkers.

Full reference: https://ohjustanother.site
