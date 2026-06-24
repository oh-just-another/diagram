# @oh-just-another/scene

L1 domain model: immutable scenes, patch-based operations, plugin-extensible elements, and the geometry/layout/routing primitives built on top of them.

No DOM, no React, no Node API. Depends only on `@oh-just-another/types`, `@oh-just-another/math` and `fractional-keys`.

## Concepts

- **Scene** — a container of elements, links, layers, annotations, a viewport and binary files. All fields are immutable; every operation returns a new `Scene`.
- **Element / Link / Layer** — entities. Elements have an open type discriminator (`type: string`) so plugins can register their own variants. Built-ins: `rectangle`, `ellipse`, `polygon`, `path`, `text`, `image`, `template`, `group`, `frame`, `block-arrow`, `brush`. A `Link` is a connector between elements, attached at anchors.
- **Order (fractional index)** — every element, link and layer carries an `order` string. Z-order = sort by `order`. Inserts and reorders are O(1) and conflict-free under concurrent edits.
- **Patch** — every operation returns a `Patch` with `before` and `after`. `invert(patch)` swaps them; this powers history and CRDT replay symmetrically.
- **Membership on children** — `element.layerId` is the single source of truth; cross-layer moves are an O(1) field update.

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

| Area                   | Highlights                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types & style          | `Element`, `BuiltinElement`, `RectangleElement` … `BrushElement`, `PathCommand`, `Link`, `LinkEndpoint`, `LinkRouting`, `Layer`, `Viewport`, `Scene`, `Style`, `TextStyle`; `getCornerRadius`, `strokeOutsideExtent`.                                                                                                   |
| Element helpers        | `isRectangle` … `isBrush` type guards, `registerBounder` / `getBounder`, `getElementLocalBounds` / `getElementWorldBounds`, `registerRenderOverflow` / `getElementRenderBounds`, `setTextMeasurer` / `getTextMeasurer`.                                                                                                 |
| Anchors                | `STANDARD_ANCHORS`, `CARDINAL_ANCHORS`, `getAnchorLocal` / `getAnchorWorld`, `getAnchorOutwardNormal`, `listAnchorsLocal`, `findNearestAnchor`, `snapExcludedAnchors`.                                                                                                                                                  |
| Outline samplers       | `OutlineSampler`, `registerOutlineSampler` / `getOutlineSampler`, `getOutlinePoint`, `findNearestOutlinePoint`.                                                                                                                                                                                                         |
| Snap engine            | `SnapEngine` with built-in contributors `gridSnapper`, `anchorSnapper`, `outlineSnapper`; `SnapCandidate` / `SnapContext` / `SnapContributor`.                                                                                                                                                                          |
| Viewport helpers       | `DEFAULT_VIEWPORT`, `getWorldToScreen` / `getScreenToWorld`, `panBy`, `zoomAt`, `resize`, `resolveSnapSpacing`, `isSnapToGridEnabled`.                                                                                                                                                                                  |
| Scene & ordering       | `emptyScene`, `DEFAULT_SCENE`, `DEFAULT_LAYER_ID`, `apply`, `orderForTop` / `orderForBottom` / `orderBetween` / `orderBetweenMany`, `byOrderAsc` / `byOrderDesc`.                                                                                                                                                       |
| Patch utilities        | `invert`, `batch`, `isNoop`.                                                                                                                                                                                                                                                                                            |
| Operations             | `addElement` / `removeElement` / `updateElement` / `moveElement`, `addLink` / `removeLink` / `updateLink`, `addLayer` / `removeLayer` / `updateLayer`, `setViewport`, `addAnnotation` / `removeAnnotation` / `updateAnnotation`. Each returns `{ scene, patch }`.                                                       |
| Annotations            | `Annotation`, `Comment`, `getAnnotationWorldPosition`.                                                                                                                                                                                                                                                                  |
| Queries                | `getElement` / `getLink` / `getLayer`, `getLayersInOrder`, `getElementsInLayer` / `getLinksInLayer`, `getElementsInBounds` / `getElementsCoveredByBounds`, `getElementAt`, `getChildrenOf` / `getDescendantsOf` / `getRootSelf`, `isElementLocked` / `isElementHidden`, `getElementOutline` / `registerElementOutline`. |
| Spatial index          | `buildSpatialIndex` + `queryByIndex` (and `getElementAtIndexed`) for fast range queries; `SpatialGrid` class for advanced use.                                                                                                                                                                                          |
| Layout                 | `gridLayout`, `stackLayout`, `wrapLayout` (+ `measureWrap`), `treeLayout`, `getAutoLayoutSpec` / `runAutoLayout`; specs `GridLayoutSpec` … `AutoLayoutSpec`. Registry: `registerLayoutKind` / `unregisterLayoutKind` / `getLayoutKind` / `listLayoutKinds`.                                                             |
| Elbow router           | `elbowRoute` (A\*-based, obstacle-avoiding 90° routing), `routeElbowLink` / `routeElbowPreview`; heading helpers `headingForPoint`, `flipHeading`, `vectorToHeading`, `HEADING_RIGHT` … `HEADING_UP`.                                                                                                                   |
| Edge geometry & curves | `getLinkPath`, `getLinkEndpointWorld`, `findLinkAt`, `getLinkCurvePoints` / `getLinkCurveSegments`, `getLinkWaypointMidpoints`, `getSelfLoopSpec`; `catmullRomBeziers`, `cubicWithEndTangents`, `flattenSegments`.                                                                                                      |
| Diff & merge           | `diffSceneElements` (`SceneElementDiff`); three-way merge `mergeScenesThreeWay` / `applyConflictResolutions` with `ThreeWayMergeOptions` / `ThreeWayMergeReport` / `ThreeWayMergeConflict`.                                                                                                                             |
| Container protocol     | `isContainer`, `getContainerSpec`, `findContainerAt`, `getDropZoneWorld` / `getDropZonesWorld`, `expandDropZoneToFit`, `containerSizeForZone`, `registerContainerResolver` / `registerContainerZonesResolver`.                                                                                                          |
| Hydration              | `hydrateScene` / `dehydrateScene`, `VIEWPORT_SCOPE`; `SettingScope`, `SceneSettings`, `HydrateInput`.                                                                                                                                                                                                                   |
| Binary files           | `addBinaryFile` / `removeBinaryFile` / `getBinaryFile`, `createBinaryFile`, `BinaryFile`.                                                                                                                                                                                                                               |
| Accessibility          | `getElementAccessibleName`, `registerAccessibleName`, `AccessibleNameResolver`.                                                                                                                                                                                                                                         |
| Constants              | `DEFAULT_GRID_SPACING`, `SNAP_PROBE_CULL_RADIUS`, `ELBOW_OBSTACLE_MARGIN`, `FRAME_HEADER_HEIGHT`, `ADAPTIVE_CORNER_RADIUS`, … — tunable thresholds and defaults.                                                                                                                                                        |

Full reference: https://ohjustanother.site

## Design notes

- **Open `Element`.** `Element = BuiltinElement | ElementBase` so plugins can extend without forking. Built-in variants are still strongly typed and pickable through type guards.
- **Layer/element z-order on the entity, not in a list.** `order: FractionalIndex` allows any insert position without renumbering. Tradeoff: every entity carries the order key.
- **Patches store `before` _and_ `after`.** `invert` is a pure swap; the kernel never inspects the surrounding scene to compute an undo. Tradeoff: slightly larger patches, bounded and worth it for symmetric history.
- **Spatial grid, not a tree.** A uniform-cell grid is simpler and faster at editor scale (≤ ~10k elements) and meets the sub-millisecond range-query target. The public surface (`SpatialGrid` + `buildSpatialIndex` / `queryByIndex`) is small enough to keep stable if the backing structure ever changes.
- **Extension via registries.** Bounders, outline samplers, anchors, layout kinds, container resolvers, render overflow and accessible names are all registered through small functions, so higher layers add behaviour without scene depending on them.
