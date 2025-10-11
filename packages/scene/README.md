# @oh-just-another/scene

L1 domain model: immutable scenes, patch-based operations, plugin-extensible elements, and a fast spatial index.

No DOM, no React, no Node API. Depends only on `@oh-just-another/types`, `@oh-just-another/math` and `fractional-keys`.

## Concepts

- **Scene** — a container of elements, links, layers and a viewport. All fields are immutable; every operation returns a new `Scene`.
- **Element / Link / Layer** — entities. Elements have an open type discriminator (`type: string`) so plugins can register their own variants. Built-ins: `rectangle`, `ellipse`, `polygon`, `path`, `text`, `image`. (A `Link` is a connector between elements; an element's geometric *shape* — rectangle/ellipse/path — is a form-primitive, distinct from the element itself.)
- **Order (fractional index)** — every element, link and layer carries an `order` string. Z-order = sort by `order`. Inserts and reorders are O(1) and conflict-free under concurrent edits (needed for Phase 13 collab).
- **Patch** — every operation returns a `Patch` with `before` and `after`. `invert(patch)` swaps them; this powers history and CRDT replay symmetrically.
- **Bounder registry** — local AABB computation is per-type. Built-in elements ship with bounders; plugins register their own via `registerBounder`.
- **Spatial index** — `SpatialGrid` uniform-cell index. `buildSpatialIndex(scene)` + `queryByIndex(scene, grid, range)` give sub-millisecond range queries on 1000-element scenes.

## Quick start

```ts
import {
  emptyScene,
  addElement,
  apply,
  invert,
  orderForTop,
  buildSpatialIndex,
  queryByIndex,
  DEFAULT_LAYER_ID,
  type Element,
} from "@oh-just-another/scene";
import { elementId } from "@oh-just-another/types";

const r: Element = {
  id: elementId("r1"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderForTop([]),
  style: { fill: "#88f" },
  width: 100,
  height: 50,
};

const { scene: s1, patch } = addElement(emptyScene(), r);
const s2 = apply(s1, invert(patch)); // undo

const grid = buildSpatialIndex(s1);
const hits = queryByIndex(s1, grid, { x: 0, y: 0, width: 50, height: 50 });
```

## API surface

| Module             | Highlights                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types              | `Element`, `BuiltinElement`, `RectangleElement` … `ImageElement`, `PathCommand`, `Link`, `Layer`, `Viewport`.                                                                 |
| Style              | `Style`, `TextStyle`, plus `LineCap` / `LineJoin` / `TextAlign` / `TextBaseline`.                                                                                     |
| Element helpers    | `isRectangle` … `isImage`, `registerBounder`, `getElementLocalBounds`, `getElementWorldBounds`.                                                                       |
| Viewport helpers   | `DEFAULT_VIEWPORT`, `getWorldToScreen`, `getScreenToWorld`, `panBy`, `zoomAt`, `resize`.                                                                              |
| Scene constructors | `emptyScene`, `DEFAULT_LAYER_ID`, `apply`, `orderForTop`, `orderForBottom`, `orderBetween`.                                                                           |
| Patch utilities    | `invert`, `batch`, `isNoop`.                                                                                                                                          |
| Operations         | `addElement`, `removeElement`, `updateElement`, `moveElement`, `addLink`/`removeLink`/`updateLink`, `addLayer`/`removeLayer`/`updateLayer`, `setViewport`.            |
| Queries            | `getElement`, `getLink`, `getLayer`, `getLayersInOrder`, `getElementsInLayer`, `getLinksInLayer`, `getElementsInBounds`, `getElementAt`, `buildSpatialIndex`, `queryByIndex`. |
| Spatial            | `SpatialGrid` (the underlying class for advanced use).                                                                                                                |

## Design notes

- **Open `Element`.** `Element = BuiltinElement | ElementBase` so plugins can extend without forking. Built-in variants are still strongly typed and pickable through type guards.
- **Membership stored on children, not on layers.** `element.layerId` is the single source of truth. Cross-layer moves are an O(1) field update; no rebalance of any list.
- **Layer/element z-order on the entity, not in a list.** `order: FractionalIndex` allows any insert position without renumbering. Tradeoff: every layer/element carries the order key.
- **Patches store `before` _and_ `after`.** `invert` is a pure swap; the kernel never needs to look at the surrounding scene to compute an undo. Tradeoff: slightly larger patches; this is bounded and worth it for symmetric history.
- **Spatial grid, not R-tree.** A uniform grid is simpler and faster for editor-scale (≤ ~10k elements) and is good enough to meet the < 1 ms range-query target. We can swap to an R-tree (`rbush`) if a workload demands it; the public surface (`SpatialGrid`-like API + `buildSpatialIndex`/`queryByIndex`) is small enough to keep stable.

