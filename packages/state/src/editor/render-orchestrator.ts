import {
  getLink,
  getLinkPath,
  getLinkCurvePoints,
  getLinkWaypointMidpoints,
  getElement,
  getElementWorldBounds,
  getElementOutline,
  getWorldToScreen,
  getDropZonesWorld,
  strokeOutsideExtent,
  isFrame,
  isImage,
  type BrushPoint,
  type Scene,
  type Style,
  type Element,
  type Link,
  type SpatialGrid,
  getElbowSegmentHandles,
} from "@oh-just-another/scene";
import {
  DEFAULT_LOD,
  renderLinks,
  renderGrid,
  renderScene,
  setAnimationClock,
  type AnimationClock,
  type RenderTarget,
  type ElementCache,
} from "@oh-just-another/renderer-core";
import {
  renderOverlay,
  paintElementSelectionHalo,
  type ElementHalo,
  type OverlayOptions,
  type PortOverlay,
  type PeerCursor,
  type PeerSelection,
} from "../overlay.js";
import { anchorOverlayPoints } from "./anchor-points.js";
import { hitZoneVisibility } from "./hit-test.js";
import { buildElementForCreate, buildEdgePreviewLink } from "./applies/create.js";
import {
  ANCHOR_DOT_ACTIVE_RADIUS,
  ANCHOR_DOT_RADIUS,
  ANCHOR_DOT_HOVER_GROW_RADIUS,
  ANCHOR_DOT_HOVER_MAX_RADIUS,
  DEFAULT_SNAP_THRESHOLD,
  FLOWCHART_PREVIEW_OPACITY,
  GHOST_PREVIEW_OPACITY,
  ERASE_DIM_OPACITY,
  ISOLATION_DIM_OPACITY,
  LINK_START_ANCHOR_OUTSET,
  LINK_ATTACH_ANCHOR_OUTSET,
} from "../constants.js";
import type {
  Bounds,
  ElementId,
  LinkId,
  LayerId,
  AnnotationId,
  Vec2,
} from "@oh-just-another/types";
import type { Mode } from "../modes.js";
import type {
  ContainerHover,
  EdgePreview,
  HoveredLinkTarget,
  LinkDragFromAnchor,
  PanGesture,
} from "./interaction-state.js";
import type { LaserStroke } from "./public/laser.js";
import type { TileComposeFn } from "../editor.js";

/**
 * Live brush-stroke preview: the in-progress stroke run through the commit
 * pipeline (catch-up + smoothing) plus the paint colour and opacity it will
 * commit with, so the overlay preview matches the committed stroke exactly
 * (no geometry / colour / opacity snap on release). A derived snapshot — it
 * deliberately does NOT extend the mutable `BrushStrokeState` capture bag.
 */
export interface BrushPreview {
  readonly origin: Vec2;
  readonly points: readonly BrushPoint[];
  readonly fill: string;
  readonly opacity: number;
}

/**
 * Flat, self-contained data bag the {@link renderEditor} orchestrator paints
 * from — every field the render pass reads, precomputed by the Editor. Breaks
 * the Editor ↔ orchestrator import cycle: the orchestrator no longer imports
 * (nor reaches into) the `Editor` class, it just consumes this snapshot.
 *
 * All derived viewport/dirty/dim/hide inputs and the shared spatial index are
 * resolved up front (same call order as before) so painting is side-effect
 * free. The two runtime-parameterised lookups the overlay path still needs —
 * click-create preview and GIF playback state — come in as narrow callbacks.
 */
export interface RenderSnapshot {
  // Render targets.
  readonly mainTarget: RenderTarget;
  readonly overlayTarget: RenderTarget;
  readonly backgroundTarget: RenderTarget | null;
  // Scene + selection.
  readonly scene: Scene;
  readonly selection: ReadonlySet<ElementId>;
  readonly selectedLinks: ReadonlySet<LinkId>;
  /** Sole selected link (handles shown) or `null` for multi/mixed/none. */
  readonly selectedLink: LinkId | null;
  readonly selectedAnnotation: AnnotationId | null;
  readonly enteredGroup: ElementId | null;
  // Precomputed render inputs.
  readonly gridEnabled: boolean;
  readonly viewportWorld: Bounds | null;
  readonly dirtyWorld: Bounds | null;
  readonly dimElements: ReadonlySet<ElementId> | undefined;
  /**
   * `true` while an eraser sweep has marked shapes for deletion — the dim set
   * then fades at {@link ERASE_DIM_OPACITY} (strong "about to delete") instead
   * of the gentler group-isolation {@link ISOLATION_DIM_OPACITY}.
   */
  readonly eraseActive: boolean;
  readonly hideElements: ReadonlySet<ElementId> | undefined;
  readonly sharedIndex: SpatialGrid | null;
  readonly boundsCache: ElementCache<Bounds>;
  /**
   * Per-instance animated-content playback clock. Threaded into `renderScene`
   * via {@link RenderSceneOptions.clock} so this editor's per-shape GIF
   * playback (pause / offset) doesn't leak through the process-global
   * `setAnimationClock`. The tile path can't carry a render context, so it
   * bridges this onto the module fallback right before compositing.
   */
  readonly animationClock: AnimationClock;
  readonly tileComposeFn: TileComposeFn | null;
  readonly tileDirtyElements: Map<ElementId, { before: Bounds | null; after: Bounds | null }>;
  // Interaction / overlay state.
  readonly mode: Mode;
  readonly activeLayerId: LayerId;
  /** World-space corners of the pending image-crop frame, or null. */
  readonly cropFrame: readonly Vec2[] | null;
  /**
   * Crop-mode ghost: the original image element (transform + live bitmap
   * handle via `metadata.image`) and the virtual full-image LOCAL rect. The
   * overlay paints the full bitmap faintly over this rect so hidden parts stay
   * visible while cropping. `null` when not cropping.
   */
  readonly cropGhost: { readonly element: Element; readonly fullRect: Bounds } | null;
  /**
   * Pending flowchart-create preview: the not-yet-committed nodes + links drawn
   * faintly on the overlay while a `Cmd/Ctrl+Arrow` grow session is open.
   * `null` when no session is active.
   */
  readonly flowchartPreview: {
    readonly elements: readonly Element[];
    readonly links: readonly Link[];
  } | null;
  /**
   * Pending stroke-erase preview: the fragments each touched brush would be cut
   * into while a Shift-held eraser gesture drags. Drawn on the overlay; the
   * touched originals are already in `hideElements`. `null` when no such
   * gesture is active. Fragment ids are ephemeral (never enter history).
   */
  readonly strokeErasePreview: {
    readonly elements: readonly Element[];
    readonly hidden: ReadonlySet<ElementId>;
  } | null;
  readonly lassoPreview: Bounds | null;
  readonly drawingPreview: Bounds | null;
  readonly edgePreview: EdgePreview | null;
  readonly linkDragFromAnchor: LinkDragFromAnchor | null;
  readonly hoveredLinkTarget: HoveredLinkTarget | null;
  readonly panGesture: PanGesture | null;
  readonly pinchActive: boolean;
  readonly gestureActive: boolean;
  readonly linkEndpointDrag: { linkId: LinkId; side: "from" | "to"; toPoint: Vec2 } | null;
  readonly linkSegmentDrag: { linkId: LinkId; axis: "h" | "v"; at: number } | null;
  readonly linkWaypointDrag: { linkId: LinkId; index: number; pendingInsert: boolean } | null;
  readonly hoverCursorWorld: Vec2 | null;
  readonly anchorStartHitSlop: number;
  readonly anchorClickRadius: number;
  readonly containerHover: ContainerHover | null;
  readonly brushStroke: BrushPreview | null;
  readonly laserStrokes: readonly LaserStroke[];
  /** Fading eraser drag trail (laser-style), painted in neutral grey. */
  readonly eraserTrail: readonly LaserStroke[];
  /**
   * Eraser cursor ring: the world-space hover centre and its SCREEN-px radius
   * (the panel's eraser width). `null` unless the erase tool is active with a
   * live hover point and the editor is editable. The overlay hides the OS
   * cursor in erase mode and paints this ring in its place.
   */
  readonly eraserCursor: { readonly center: Vec2; readonly radius: number } | null;
  readonly peerCursors: readonly PeerCursor[];
  readonly peerSelections: readonly PeerSelection[];
  readonly debugHitZones: boolean;
  /**
   * Read-only / view mode. When true the overlay paints selection outlines
   * (halo) but suppresses every interactive handle — resize / rotate grips,
   * group-bounds handles and link endpoint/bend handles — so a viewer can't
   * grab an affordance that would mutate the scene.
   */
  readonly readOnly: boolean;
  readonly groupMoveOrigin: ReadonlyMap<ElementId, Vec2> | null;
  readonly aspectLocked: boolean;
  readonly combinedSelectionBounds: Bounds | null;
  readonly editingText: {
    caret: { x: number; y: number; height: number } | null;
    caretColor: string;
    selectionRects: readonly Bounds[];
  } | null;
  // Runtime-parameterised lookups (narrow callbacks, not the Editor class).
  readonly previewClickCreate: (
    fromElement: ElementId,
    anchorName: string,
  ) => {
    bounds: Bounds;
    path: readonly Vec2[];
    element: Element;
    ghostScene: Scene;
    ghostLinkId: LinkId;
  } | null;
  readonly isPlaybackPaused: (id: ElementId) => boolean;
}

/**
 * Stable throwaway id for the transient shape-draw preview element. Never
 * enters the scene / history — it exists only for the duration of a single
 * overlay paint, so any constant id is fine.
 */
const DRAW_PREVIEW_ELEMENT_ID = "__draw-preview__" as ElementId;

/** Throwaway id for the live draw-edge connector preview link. */
const DRAW_PREVIEW_LINK_ID = "__draw-preview-link__" as LinkId;

import { req } from "../util.js";

/**
 * Per-overlay-target memo of the last-painted {@link renderOverlay} options bag
 * (plus the two throwaway ghost / edge-preview scenes). Reused across frames
 * whose overlay inputs are identity-unchanged — see {@link buildOverlaySignature}.
 */
interface OverlayMemo {
  readonly sig: readonly unknown[];
  readonly opts: OverlayOptions;
  readonly ghostScene: Scene | null;
  readonly edgePreviewScene: Scene | null;
  readonly flowchartPreviewScene: Scene | null;
}

const overlayMemoByTarget = new WeakMap<RenderTarget, OverlayMemo>();

/**
 * Cheap identity signature of every input the overlay-options build reads.
 * Element-wise `Object.is`-compared against the previous frame's; a full match
 * means the bag would rebuild identically, so the prior object is reused.
 *
 * Reference-stable interaction fields (selection, hover, drag state, peer
 * arrays, scene) compare by identity; primitives by value. Two derived values
 * are deliberately absent — `combinedSelectionBounds` and `aspectLocked` are
 * pure functions of `scene` + `selection` (+ `selectedLinks`), all already
 * here, so their freshly-allocated results can't diverge while those match.
 * `gifBadges` is excluded on purpose (its playback-pause input advances outside
 * the signature) and recomputed every frame. `editingText` (fresh each frame
 * while editing) is included, so the memo simply doesn't engage during text
 * editing — not an idle path.
 */
const buildOverlaySignature = (e: RenderSnapshot): readonly unknown[] => [
  e.scene,
  e.selection,
  e.selectedLinks,
  e.selectedLink,
  e.selectedAnnotation,
  e.mode,
  e.activeLayerId,
  e.cropFrame,
  e.cropGhost,
  e.flowchartPreview,
  e.strokeErasePreview,
  e.lassoPreview,
  e.drawingPreview,
  e.edgePreview,
  e.linkDragFromAnchor,
  e.hoveredLinkTarget,
  e.panGesture,
  e.pinchActive,
  e.gestureActive,
  e.linkEndpointDrag,
  e.linkSegmentDrag,
  e.linkWaypointDrag,
  e.hoverCursorWorld,
  e.anchorStartHitSlop,
  e.anchorClickRadius,
  e.containerHover,
  e.brushStroke,
  e.laserStrokes,
  e.eraserTrail,
  e.eraserCursor,
  e.peerCursors,
  e.peerSelections,
  e.debugHitZones,
  e.readOnly,
  e.groupMoveOrigin,
  e.editingText,
];

const overlaySigEqual = (a: readonly unknown[], b: readonly unknown[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
};

/**
 * Render orchestrator: background grid pass, tile-cache vs full renderScene
 * path, and the overlay options builder (drawing / lasso preview, edge
 * preview, hovered ports, group handles, container drop zone, brush stroke,
 * edge endpoint drag, peer cursors, annotations). Consumes a flat
 * {@link RenderSnapshot} the Editor builds each frame — no coupling to the
 * `Editor` class. The single call site is editor.ts's own private `render()`
 * wrapper. Side-effect free apart from the paint itself: the caller owns the
 * `lastRendered*` bookkeeping and the tile-dirty reset.
 */
export const renderEditor = (editor: RenderSnapshot): void => {
  // Background layer (grid + selection halo), when the host gave us a
  // dedicated target. The grid clears it each frame; the contour selection
  // halo is then painted on top of the grid but UNDER the shapes (main
  // layer), so it peeks out from behind each selected element. Its own clean
  // Canvas2D layer avoids dirty-rect flicker and paint-state bleed into the
  // shape pass. Without a background layer the grid lives on mainTarget
  // before shapes are drawn, so renderScene's clear takes care of it.
  if (editor.backgroundTarget) {
    // Grid pass also clears the background layer each frame. When the grid is
    // toggled off, still clear it so no stale grid lingers under the halos.
    if (editor.gridEnabled) renderGrid(editor.scene, editor.backgroundTarget);
    else editor.backgroundTarget.clear();
    const halos: ElementHalo[] = [];
    for (const id of editor.selection) {
      const shape = getElement(editor.scene, id);
      if (!shape) continue;
      const style: Style = (shape as { style?: Style }).style ?? {};
      halos.push({
        loops: getElementOutline(editor.scene, shape),
        outsetWorld: strokeOutsideExtent(style),
      });
    }
    if (halos.length > 0) {
      paintElementSelectionHalo(
        editor.backgroundTarget,
        getWorldToScreen(editor.scene.viewport),
        halos,
        editor.scene.viewport.zoom || 1,
      );
    }
  }
  // World-space viewport rect — used by `renderScene` to skip off-screen
  // shapes. Computed by mapping the screen viewport corners through the
  // inverse projection. Slightly inflated so geometry near the edge
  // does not flicker during pan.
  const viewportWorld = editor.viewportWorld;
  const dirtyWorld = editor.dirtyWorld;
  const dimElements = editor.dimElements;
  const hideElements = editor.hideElements;

  // Group isolation (dim) and per-element hide can't be honoured by the tile
  // cache: tiles bake every shape at full opacity, so neither a scrim nor an
  // overlay can reproduce `renderScene`'s per-element dim, nor un-bake a hidden
  // shape, without re-rasterising the affected tiles — which would tie the
  // cache to isolation state and defeat it. So while either set is non-empty
  // we take the full `renderScene` path (which honours both). With both empty
  // — the intended very-large-static-scene case — the tile path runs and
  // behaves exactly as before.
  const isolationActive =
    (dimElements !== undefined && dimElements.size > 0) ||
    (hideElements !== undefined && hideElements.size > 0);
  if (editor.tileComposeFn && viewportWorld && !isolationActive) {
    // Tile-cache path: clear main once, then composite cached tiles.
    // The compositor rasterises tiles through its own `renderScene` calls,
    // which we can't hand a render context — bridge this editor's per-instance
    // clock onto the process-global fallback so animated tiles still honour
    // per-shape playback. Scoped to this opt-in path (rare); the common paths
    // no longer touch the module global.
    setAnimationClock(editor.animationClock);
    editor.mainTarget.clear();
    // Feed the persistent spatial index (shared with the hit-test path) when
    // the editor keeps one, so the compositor's per-tile element selection
    // queries the index instead of scanning every shape in every layer.
    editor.tileComposeFn(editor.scene, editor.mainTarget, {
      viewport: viewportWorld,
      changedElements: editor.tileDirtyElements,
      zoomBucket:
        editor.scene.viewport.zoom > 0 ? 2 ** Math.round(Math.log2(editor.scene.viewport.zoom)) : 1,
      ...(editor.sharedIndex ? { index: editor.sharedIndex } : {}),
    });
    renderLinks(editor.scene, editor.mainTarget, { viewportWorld });
  } else {
    // For very large scenes share the same SpatialGrid the hit-test path
    // already maintains — `renderScene` uses it to skip the per-shape AABB
    // cull on shapes outside the viewport.
    const sharedIndex = editor.sharedIndex;
    renderScene(editor.scene, editor.mainTarget, {
      ...(viewportWorld ? { viewport: viewportWorld } : {}),
      ...(dirtyWorld ? { dirtyWorld } : {}),
      boundsCache: editor.boundsCache,
      clock: editor.animationClock,
      lod: DEFAULT_LOD,
      ...(dimElements
        ? {
            dimElements,
            dimOpacity: editor.eraseActive ? ERASE_DIM_OPACITY : ISOLATION_DIM_OPACITY,
          }
        : {}),
      ...(hideElements ? { hideElements } : {}),
      ...(sharedIndex ? { spatialIndex: sharedIndex } : {}),
    });
    renderLinks(editor.scene, editor.mainTarget, {
      ...(viewportWorld ? { viewportWorld } : {}),
      ...(dirtyWorld ? { dirtyWorld } : {}),
    });
  }
  // Overlay options bag — rebuilding it allocates dozens of objects (port
  // sets, link halos, handle midpoints, debug zones). On idle / animation /
  // peer-update frames none of its inputs changed, so memoize the whole bag by
  // a cheap identity signature per overlay target and reuse the prior object.
  // `gifBadges` — whose input (per-shape GIF playback pause) advances on its
  // own timeline, outside the signature — is recomputed every frame below.
  const overlaySig = buildOverlaySignature(editor);
  let overlayMemo = overlayMemoByTarget.get(editor.overlayTarget);
  if (overlayMemo === undefined || !overlaySigEqual(overlayMemo.sig, overlaySig)) {
    const overlayOpts: Parameters<typeof renderOverlay>[3] = {};
    // Read-only: keep selection outlines but drop every interactive handle.
    if (editor.readOnly) overlayOpts.readOnly = true;
    // Non-select tool active: same handle suppression — the chrome is not
    // pressable (pickPressTarget gates it), so don't advertise it. `hand` is
    // navigation-only and keeps the chrome visible for context.
    if (editor.mode !== "select" && editor.mode !== "hand") overlayOpts.suppressHandles = true;
    // Image-crop chrome (crop mode) — dashed accent quad over the pending
    // window, 8 grab handles, and the faint full-image ghost behind them.
    if (editor.cropFrame) overlayOpts.cropFrame = editor.cropFrame;
    if (editor.cropGhost) overlayOpts.cropGhost = editor.cropGhost;
    // Throwaway scene holding the click-create ghost connector — rendered
    // through the real link renderer (faded) AFTER the overlay, so the ghost
    // connector matches the link that will be created (routing / arrowhead /
    // style), not a dashed preview line. Set in the start-dot hover branch.
    let ghostScene: Scene | null = null;
    // The lasso (select-mode rubber-band) keeps the plain dashed rect. A shape
    // draw (draw-rect / draw-ellipse) shows a preview of the would-be element
    // rendered through its real renderer — the user sees the actual shape +
    // default style they'll get on release, not just a dashed box. Both
    // gestures can't run at once, so one slot is set.
    if (editor.lassoPreview) {
      overlayOpts.drawingPreview = editor.lassoPreview;
    } else if (editor.drawingPreview) {
      const kind =
        editor.mode === "draw-rect" ? "rect" : editor.mode === "draw-ellipse" ? "ellipse" : null;
      if (kind) {
        overlayOpts.drawingPreviewElement = buildElementForCreate(
          editor.scene,
          kind,
          editor.drawingPreview,
          DRAW_PREVIEW_ELEMENT_ID,
          editor.activeLayerId,
          () => "",
        );
      } else {
        overlayOpts.drawingPreview = editor.drawingPreview;
      }
    }
    // Draw-edge connector preview: render the would-be link through the real
    // link renderer (solid, default arrowheads, full colour) so the dragged
    // preview looks exactly like the link that'll be created — same default
    // object as commit (`buildLinkForCreate`), not a faded/dashed stand-in.
    let edgePreviewScene: Scene | null = null;
    if (editor.edgePreview) {
      const previewLink = buildEdgePreviewLink(
        editor.scene,
        editor.edgePreview,
        DRAW_PREVIEW_LINK_ID,
        editor.activeLayerId,
      );
      edgePreviewScene = {
        ...editor.scene,
        links: new Map([[DRAW_PREVIEW_LINK_ID, previewLink]]),
      };
    }
    // Flowchart-create preview: the pending nodes are drawn through the overlay
    // (faded, `flowchartPreviewElements`); the pending links are drawn through
    // the real link renderer onto a throwaway scene that also carries the
    // pending nodes so both endpoints resolve. Both at reduced opacity below.
    let flowchartPreviewScene: Scene | null = null;
    if (editor.flowchartPreview && editor.flowchartPreview.elements.length > 0) {
      overlayOpts.flowchartPreviewElements = editor.flowchartPreview.elements;
      const previewElements = new Map(editor.scene.elements);
      for (const el of editor.flowchartPreview.elements) previewElements.set(el.id, el);
      const previewLinks = new Map<LinkId, Link>();
      for (const link of editor.flowchartPreview.links) previewLinks.set(link.id, link);
      flowchartPreviewScene = {
        ...editor.scene,
        elements: previewElements,
        links: previewLinks,
      };
    }
    // Stroke-erase preview: the would-be brush fragments for every touched
    // brush, drawn per-element on the overlay (the originals are hidden in the
    // main pass). Uses the `flowchartPreviewElements`-style per-element paint —
    // NOT `renderScene`, which clears the overlay and would wipe the eraser
    // cursor ring / trail mid-drag.
    if (editor.strokeErasePreview && editor.strokeErasePreview.elements.length > 0) {
      overlayOpts.strokeErasePreviewElements = editor.strokeErasePreview.elements;
    }
    // Connection anchors. Two roles: link-start (on selection) and link-attach
    // (on hover/proximity). During a drag started FROM a start-anchor (select
    // mode, no tool switch) BOTH are shown: the source keeps its start dots
    // while the target shows its attach dots under the cursor.
    // Read-only never creates links, so the whole port/ghost overlay is off —
    // no anchor dots on hover, no click-create ghost element/connector.
    if (editor.mode !== "brush" && editor.mode !== "hand" && !editor.readOnly) {
      const zoom = editor.scene.viewport.zoom || 1;
      // Build one overlay port-set for a shape. The free outline-attach point
      // (`outlinePoint`, link-attach only) is appended un-offset — it is the
      // real landing point. `activeAnchorName` highlights the snap target if it
      // is one of the named dots.
      const buildPortSet = (
        shapeId: ElementId,
        role: "link-start" | "link-attach",
        activeAnchorName: string | null,
        outlinePoint?: Vec2,
      ): PortOverlay | null => {
        const shape = getElement(editor.scene, shapeId);
        if (!shape) return null;
        const outsetPx =
          role === "link-start" ? LINK_START_ANCHOR_OUTSET : LINK_ATTACH_ANCHOR_OUTSET;
        const { names, worldPoints: anchorPts } = anchorOverlayPoints(shape, outsetPx / zoom);
        const worldPoints: Vec2[] = [...anchorPts];
        const namedActive = activeAnchorName !== null ? names.indexOf(activeAnchorName) : -1;
        if (role === "link-attach" && outlinePoint) worldPoints.push(outlinePoint);
        const activeIndex =
          namedActive >= 0
            ? namedActive
            : role === "link-attach" && outlinePoint
              ? worldPoints.length - 1
              : -1;
        return {
          worldPoints,
          ...(activeIndex >= 0 ? { activeIndex } : {}),
          role,
        };
      };

      const portSets: PortOverlay[] = [];
      if (editor.linkDragFromAnchor) {
        // Drag from a start-anchor: keep the source's start dots visible…
        const startSet = buildPortSet(editor.linkDragFromAnchor.fromElement, "link-start", null);
        if (startSet) portSets.push(startSet);
        // …and show the target's attach dots under the cursor.
        if (editor.hoveredLinkTarget) {
          const t = editor.hoveredLinkTarget;
          const attachSet = buildPortSet(
            t.elementId,
            "link-attach",
            t.activeAnchor,
            t.outlinePoint,
          );
          if (attachSet) portSets.push(attachSet);
        }
      } else if (editor.hoveredLinkTarget) {
        // Proximity snap while a link is drawn with the draw-edge tool.
        const t = editor.hoveredLinkTarget;
        const attachSet = buildPortSet(t.elementId, "link-attach", t.activeAnchor, t.outlinePoint);
        if (attachSet) portSets.push(attachSet);
      } else if (
        !editor.panGesture &&
        !editor.pinchActive &&
        !editor.gestureActive && // hide only during a real drag (tx opens on first move-patch), not on a bare press
        !editor.edgePreview && // don't show start-anchors if we are already drawing a link
        !editor.linkEndpointDrag // or dragging an existing endpoint
      ) {
        // At rest — show link-start anchors for the single selected element, and
        // only while the cursor is over it or within reach of its dots: dots sit
        // just OUTSIDE the edges, so the hover zone is the element bounds
        // expanded by the outset + dot grab radius. Keeps them visible as the
        // cursor travels out to a dot. Dots are NOT shown on unselected
        // elements — select first, then connect. The dot nearest the cursor
        // grows (`ANCHOR_DOT_HOVER_GROW_RADIUS`).
        const cursor = editor.hoverCursorWorld;
        if (editor.selection.size === 1 && cursor) {
          const id = req([...editor.selection][0]);
          const shape = getElement(editor.scene, id);
          if (shape) {
            const b = getElementWorldBounds(shape);
            const pad =
              (LINK_START_ANCHOR_OUTSET + ANCHOR_DOT_ACTIVE_RADIUS + editor.anchorStartHitSlop) /
              zoom;
            const near =
              cursor.x >= b.x - pad &&
              cursor.x <= b.x + b.width + pad &&
              cursor.y >= b.y - pad &&
              cursor.y <= b.y + b.height + pad;
            if (near) {
              const set = buildPortSet(id, "link-start", null);
              if (set) {
                const r = ANCHOR_DOT_HOVER_GROW_RADIUS / zoom;
                let bestI = -1;
                let bestD2 = r * r;
                set.worldPoints.forEach((p, i) => {
                  const dx = p.x - cursor.x;
                  const dy = p.y - cursor.y;
                  const d2 = dx * dx + dy * dy;
                  if (d2 <= bestD2) {
                    bestD2 = d2;
                    bestI = i;
                  }
                });
                if (bestI >= 0) {
                  // Smooth proximity grow: scale the nearest dot from its resting
                  // radius up to the max as the cursor closes in (t = 1 at the
                  // dot, 0 at the edge of the grow radius).
                  const t = r > 0 ? Math.max(0, 1 - Math.sqrt(bestD2) / r) : 0;
                  const activeRadius =
                    ANCHOR_DOT_RADIUS + (ANCHOR_DOT_HOVER_MAX_RADIUS - ANCHOR_DOT_RADIUS) * t;
                  portSets.push({ ...set, activeIndex: bestI, activeRadius });
                } else {
                  portSets.push(set);
                }
              }
              // Hovering ON a dot (within the click radius) → ghost preview of
              // what a click would create (copy element + connector).
              const { names, worldPoints } = anchorOverlayPoints(
                shape,
                LINK_START_ANCHOR_OUTSET / zoom,
              );
              const clickR2 = (editor.anchorClickRadius / zoom) ** 2;
              let hoveredName: string | null = null;
              for (let i = 0; i < worldPoints.length; i++) {
                const p = req(worldPoints[i]);
                if ((p.x - cursor.x) ** 2 + (p.y - cursor.y) ** 2 <= clickR2) {
                  hoveredName = req(names[i]);
                  break;
                }
              }
              if (hoveredName) {
                const preview = editor.previewClickCreate(id, hoveredName);
                if (preview) {
                  overlayOpts.ghostElement = preview.bounds;
                  overlayOpts.ghostElementShape = preview.element;
                  ghostScene = preview.ghostScene;
                }
              }
            }
          }
        }
      }

      if (portSets.length === 1) overlayOpts.ports = req(portSets[0]);
      else if (portSets.length > 1) overlayOpts.ports = portSets;

      // Float-attach feedback: when the endpoint will attach to the whole
      // element (not a specific dot), highlight that element so the user knows
      // it'll float vs fix to a point.
      const hov = editor.hoveredLinkTarget;
      if (hov?.mode === "element") {
        const tshape = getElement(editor.scene, hov.elementId);
        if (tshape) overlayOpts.linkAttachHighlight = getElementWorldBounds(tshape);
      }
    }
    // Group-handle overlay: a multi-object selection (elements + links) OR a
    // single group-typed shape. A lone link keeps its endpoint handles, not a
    // resize box. Aspect-locked groups flag the overlay for corner-only handles.
    if (editor.selection.size + editor.selectedLinks.size > 1 || editor.aspectLocked) {
      const combined = editor.combinedSelectionBounds;
      if (combined) overlayOpts.groupBounds = combined;
      if (editor.aspectLocked) overlayOpts.groupAspectLocked = true;
    }
    if (editor.containerHover) {
      overlayOpts.containerDropZone = editor.containerHover.dropZone;
    }
    if (editor.brushStroke) {
      // The preview stroke is precomputed by `buildRenderSnapshot`: Catmull-Rom
      // smoothed (same resampler the commit uses) with the real paint colour and
      // opacity, so it matches the committed stroke exactly — no geometry / colour
      // / opacity snap when the pointer is lifted.
      overlayOpts.brushPreview = {
        origin: editor.brushStroke.origin,
        points: editor.brushStroke.points,
        fill: editor.brushStroke.fill,
        opacity: editor.brushStroke.opacity,
      };
    }
    if (editor.laserStrokes.length > 0) {
      overlayOpts.laserStrokes = editor.laserStrokes;
    }
    if (editor.eraserTrail.length > 0) {
      overlayOpts.eraserTrail = editor.eraserTrail;
    }
    if (editor.eraserCursor) {
      overlayOpts.eraserCursor = editor.eraserCursor;
    }
    // Persistent halo around EVERY selected link (multi-select). Curve-aware
    // so the halo follows the drawn path, matching the hover highlight.
    if (editor.selectedLinks.size > 0) {
      const halos: { path: readonly Vec2[]; width: number }[] = [];
      for (const id of editor.selectedLinks) {
        const edge = getLink(editor.scene, id);
        if (!edge) continue;
        const hpath = getLinkCurvePoints(editor.scene, edge);
        if (hpath && hpath.length >= 2) {
          halos.push({ path: hpath, width: edge.style.strokeWidth ?? 1 });
        }
      }
      if (halos.length > 0) overlayOpts.selectedLinkPaths = halos;
    }
    // Endpoint / bend handles only for the SOLE selected link (no elements);
    // a multi/mixed selection hides them to stay uncluttered.
    const soleSelectedLink = editor.selectedLink;
    if (soleSelectedLink) {
      const edge = getLink(editor.scene, soleSelectedLink);
      if (edge) {
        const path = getLinkPath(editor.scene, edge);
        if (path && path.length >= 2) {
          // During an endpoint-rebind drag the dragged end is re-pointed live in
          // the scene (the whole link follows the cursor), so `path` already
          // reflects the cursor position — handles ride along with it.
          const from = req(path[0]);
          const to = req(path[path.length - 1]);
          // Bend-point handles: existing waypoints (solid) + segment-midpoint
          // "add" handles along the logical [from, ...waypoints, to] chain.
          // Midpoints are hidden during an active waypoint drag to declutter.
          // ELBOW (orthogonal) links don't expose free bend handles — their
          // points are router output, not user-placed (segment-drag editing is
          // a separate mechanic). Only straight / bezier show free waypoints.
          const isElbow = (edge.routing ?? "straight") === "orthogonal";
          if (isElbow) {
            // Segment handles on the slidable segments of the routed chain —
            // positions shared with the pointer hit-test (and slid out from
            // under the caption pill). Hidden during an active segment /
            // endpoint drag.
            const midpoints: Vec2[] =
              editor.linkSegmentDrag || editor.linkEndpointDrag
                ? []
                : getElbowSegmentHandles(editor.scene, edge, path).map((h) => h.point);
            overlayOpts.edgeSelection = { from, to, midpoints };
          } else {
            const waypoints = [...(edge.waypoints ?? [])];
            // "Add waypoint" handles sit at the VISUAL middle of each span — on
            // the drawn arc for bezier (t=0.5 of the span's cubic), on the chord
            // for straight. The raw chord midpoint would put bezier handles off
            // the curve.
            const midpoints = editor.linkWaypointDrag
              ? []
              : (getLinkWaypointMidpoints(editor.scene, edge) ?? []);
            overlayOpts.edgeSelection = { from, to, waypoints, midpoints };
          }
        }
      }
    }
    if (editor.peerCursors.length > 0) overlayOpts.peerCursors = editor.peerCursors;
    if (editor.peerSelections.length > 0) overlayOpts.peerSelections = editor.peerSelections;
    if (editor.scene.annotations.size > 0) {
      overlayOpts.annotations = [...editor.scene.annotations.values()];
      overlayOpts.selectedAnnotation = editor.selectedAnnotation;
    }
    // In-canvas text editing: caret + selection highlight for the shape
    // under edit (null when not editing).
    const editingText = editor.editingText;
    if (editingText) overlayOpts.editingText = editingText;
    if (editor.debugHitZones) {
      overlayOpts.debugHitZones = true;
      // One decision point for which hit-zone categories are actionable now
      // (see `hitZoneVisibility`): while a link endpoint is being placed only
      // the link-attach drop-zones are live; at rest the resize / body / handle
      // / start-dot zones are. The overlay paints only the visible ones.
      const linkDragActive =
        editor.linkDragFromAnchor !== null ||
        editor.edgePreview !== null ||
        editor.linkEndpointDrag !== null;
      // An element move is in flight: position snapshot taken (groupMoveOrigin)
      // AND a real drag transaction opened (gestureTx opens only past the drag
      // threshold, so a bare press doesn't count). Resize uses groupResizeOrigin
      // instead, so this stays move-only.
      const elementDragActive = editor.groupMoveOrigin !== null && editor.gestureActive;
      const visibility = hitZoneVisibility({ linkDragActive, elementDragActive });
      overlayOpts.debugHitZoneVisibility = visibility;
      if (visibility.attachDropZones) {
        // Link-attach drop-zones (anchor catchments + edge bands + floating body)
        // the snap engine resolves against, for every element except the drag
        // source — shows where a drop lands ON a point vs ON an edge vs the body.
        const srcId = editor.linkDragFromAnchor?.fromElement;
        const anchors: Vec2[] = [];
        const outlineLoops: (readonly Vec2[])[] = [];
        for (const shape of editor.scene.elements.values()) {
          if (shape.id === srcId) continue;
          anchors.push(...anchorOverlayPoints(shape, 0).worldPoints);
          for (const loop of getElementOutline(editor.scene, shape)) outlineLoops.push(loop);
        }
        overlayOpts.debugAttachZones = {
          anchors,
          outlineLoops,
          thresholdWorld: DEFAULT_SNAP_THRESHOLD,
        };
      }
      if (visibility.containerDropZones) {
        // Element drop-zones for ALL frames + containers at once. Frames use
        // centroid-in-body (full world bounds); containers use
        // cursor-in-drop-zone (resolved zone). The dragged elements themselves
        // are skipped — you can't drop into self.
        const dragged = editor.groupMoveOrigin;
        const frames: Bounds[] = [];
        const containers: Bounds[] = [];
        for (const shape of editor.scene.elements.values()) {
          if (dragged?.has(shape.id)) continue;
          if (isFrame(shape)) {
            frames.push(getElementWorldBounds(shape));
            continue;
          }
          // All drop-zones (every lane of a multi-lane container), not just the
          // single attach zone — so a swim-lane shows a region per lane.
          containers.push(...getDropZonesWorld(shape));
        }
        overlayOpts.debugContainerZones = { frames, containers };
      }
    }
    overlayMemo = {
      sig: overlaySig,
      opts: overlayOpts,
      ghostScene,
      edgePreviewScene,
      flowchartPreviewScene,
    };
    overlayMemoByTarget.set(editor.overlayTarget, overlayMemo);
  }
  const overlayOpts = overlayMemo.opts;

  // "Play" badge on paused animated (GIF) shapes — auto-stopped or held under
  // prefers-reduced-motion. Recomputed every frame (and applied onto the
  // possibly-memoized bag): playback pause state is not part of the overlay
  // signature — it advances on its own timeline — so a memo hit must still
  // refresh the badge set.
  const gifBadges: Bounds[] = [];
  for (const shape of editor.scene.elements.values()) {
    if (isImage(shape) && shape.animationKind && editor.isPlaybackPaused(shape.id)) {
      gifBadges.push(getElementWorldBounds(shape));
    }
  }
  if (gifBadges.length > 0) overlayOpts.gifBadges = gifBadges;
  else if (overlayOpts.gifBadges !== undefined) delete overlayOpts.gifBadges;

  renderOverlay(editor.scene, editor.selection, editor.overlayTarget, overlayOpts);

  // Ghost connector (click-create hover) — drawn through the REAL link
  // renderer onto the overlay, faded, AFTER the overlay chrome so it sits on
  // top of the ghost element (matches scene z-order: links over shapes). Uses
  // the would-be link's actual routing / arrowhead / style, not a dashed line.
  if (overlayMemo.ghostScene) {
    editor.overlayTarget.save();
    editor.overlayTarget.setOpacity(GHOST_PREVIEW_OPACITY);
    renderLinks(overlayMemo.ghostScene, editor.overlayTarget, {});
    editor.overlayTarget.restore();
  }

  // Live draw-edge connector preview — real link renderer, FULL opacity (the
  // preview must look identical to the committed link, not faded/dashed).
  if (overlayMemo.edgePreviewScene) {
    renderLinks(overlayMemo.edgePreviewScene, editor.overlayTarget, {});
  }

  // Flowchart-create connectors — pending links drawn through the real link
  // renderer at reduced opacity (the pending nodes are painted by the overlay's
  // `flowchartPreviewElements` at the same opacity). Drawn last so connectors
  // sit over the nodes, matching scene z-order.
  if (overlayMemo.flowchartPreviewScene) {
    editor.overlayTarget.save();
    editor.overlayTarget.setOpacity(FLOWCHART_PREVIEW_OPACITY);
    renderLinks(overlayMemo.flowchartPreviewScene, editor.overlayTarget, {});
    editor.overlayTarget.restore();
  }
};
