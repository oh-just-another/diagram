import {
  getAnchorWorld,
  getLink,
  getLinkPath,
  getElement,
  getElementWorldBounds,
  listAnchorsLocal,
  snapExcludedAnchors,
} from "@oh-just-another/scene";
import {
  DEFAULT_LOD,
  renderLinks,
  renderGrid,
  renderScene,
} from "@oh-just-another/renderer-core";
import { renderOverlay } from "../overlay.js";
import {
  ISOLATION_DIM_OPACITY,
  LARGE_SCENE_HIT_THRESHOLD,
} from "../constants.js";

/**
 * Render orchestrator. ~130 lines of branching across:
 *   - background grid pass (if dedicated layer);
 *   - tile-cache vs full renderScene path;
 *   - overlay options builder (drawing / lasso preview, edge
 *     preview, hovered ports, group handles, container drop zone,
 *     brush stroke, edge endpoint drag, peer cursors, annotations).
 *
 * Kept in one file because the branching reads naturally top-down
 * and slicing into smaller helpers would just trade clarity for
 * file count. Same `editor: any` pragma as pointer-binding — this
 * is an "internal partial" of Editor; the single call site is in
 * editor.ts's own private `render()` wrapper.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const renderEditor = (editor: any): void => {
  // Background layer (grid) — when the host gave us a dedicated target.
  // Otherwise the grid lives on mainTarget *before* shapes are drawn,
  // so renderScene's clear takes care of it.
  if (editor.backgroundTarget) {
    renderGrid(editor._scene, editor.backgroundTarget);
  }
  // World-space viewport rect — used by `renderScene` to skip off-screen
  // shapes. Computed by mapping the screen viewport corners through the
  // inverse projection. Slightly inflated so geometry near the edge
  // does not flicker during pan.
  const viewportWorld = editor.computeViewportWorld();
  const dirtyWorld = editor.computeDirtyWorld();
  const dimElements = editor._enteredGroup
    ? editor.computeDimElements(editor._enteredGroup)
    : undefined;
  const hideElements = editor.computeHiddenElements();

  if (editor.tileComposeFn && viewportWorld) {
    // Tile-cache path: clear main once, then composite cached tiles. Dim /
    // hide sets aren't honoured by the tile cache (would require a separate
    // pass); this opt-in path is intended for very-large static scenes where
    // neither typically applies.
    editor.mainTarget.clear();
    editor.tileComposeFn(editor._scene, editor.mainTarget, {
      viewport: viewportWorld,
      changedElements: editor.tileDirtyElements,
      zoomBucket:
        editor._scene.viewport.zoom > 0
          ? 2 ** Math.round(Math.log2(editor._scene.viewport.zoom))
          : 1,
    });
    editor.tileDirtyElements = new Map();
    renderLinks(editor._scene, editor.mainTarget, {
      ...(viewportWorld ? { viewportWorld } : {}),
    });
  } else {
    // For very large scenes share the same SpatialGrid the hit-test path
    // already maintains — `renderScene` uses it to skip the per-shape AABB
    // cull on shapes outside the viewport.
    const sharedIndex =
      editor._scene.shapes.size >= LARGE_SCENE_HIT_THRESHOLD
        ? editor.ensureSpatialIndex()
        : null;
    renderScene(editor._scene, editor.mainTarget, {
      ...(viewportWorld ? { viewport: viewportWorld } : {}),
      ...(dirtyWorld ? { dirtyWorld } : {}),
      boundsCache: editor.boundsCache,
      lod: DEFAULT_LOD,
      ...(dimElements ? { dimElements, dimOpacity: ISOLATION_DIM_OPACITY } : {}),
      ...(hideElements ? { hideElements } : {}),
      ...(sharedIndex ? { spatialIndex: sharedIndex } : {}),
    });
    renderLinks(editor._scene, editor.mainTarget, {
      ...(viewportWorld ? { viewportWorld } : {}),
      ...(dirtyWorld ? { dirtyWorld } : {}),
    });
  }
  editor.lastRenderedScene = editor._scene;
  editor.lastRenderedEnteredGroup = editor._enteredGroup;
  const overlayOpts: Parameters<typeof renderOverlay>[3] = {};
  // Lasso and rect-draw share the same dashed-rect visual. Both can't
  // run simultaneously (different gestures), so a single `drawingPreview`
  // slot covers both.
  if (editor.lassoPreview) overlayOpts.drawingPreview = editor.lassoPreview;
  else if (editor.drawingPreview) overlayOpts.drawingPreview = editor.drawingPreview;
  if (editor.edgePreview) overlayOpts.edgePreview = editor.edgePreview;
  if (editor.hoveredLinkTarget) {
    const shape = getElement(editor._scene, editor.hoveredLinkTarget.elementId);
    if (shape) {
      const excluded = snapExcludedAnchors(shape);
      const names = [...listAnchorsLocal(shape).keys()].filter((n) => !excluded.has(n));
      const worldPoints = names.map((name) => getAnchorWorld(shape, { kind: "named", name }));
      const activeIndex =
        editor.hoveredLinkTarget.activeAnchor !== null
          ? names.indexOf(editor.hoveredLinkTarget.activeAnchor)
          : -1;
      overlayOpts.ports = {
        worldPoints,
        ...(activeIndex >= 0 ? { activeIndex } : {}),
      };
    }
  }
  // Group-handle overlay: multi-selection OR a single group-typed
  // shape. Aspect-locked groups also flag the overlay so it draws
  // only the four corner handles.
  if (editor._selection.size > 1 || editor.selectionIsAspectLocked()) {
    const combined = editor.combinedSelectionBounds();
    if (combined) overlayOpts.groupBounds = combined;
    if (editor.selectionIsAspectLocked()) overlayOpts.groupAspectLocked = true;
  }
  if (editor.containerHover) {
    overlayOpts.containerDropZone = editor.containerHover.dropZone;
  }
  if (editor.brushStroke) {
    overlayOpts.brushPreview = {
      origin: editor.brushStroke.origin,
      points: editor.brushStroke.points,
      fill: "#222",
    };
  }
  if (editor._selectedLink) {
    const edge = getLink(editor._scene, editor._selectedLink);
    if (edge) {
      const path = getLinkPath(editor._scene, edge);
      if (path && path.length >= 2) {
        // Endpoints in their stored positions; the dragged side jumps to
        // the cursor so the user sees where the rebind will land. The
        // edge itself stays on its old path until release.
        let from = path[0]!;
        let to = path[path.length - 1]!;
        if (editor.linkEndpointDrag?.linkId === editor._selectedLink) {
          if (editor.linkEndpointDrag.side === "from") from = editor.linkEndpointDrag.toPoint;
          else to = editor.linkEndpointDrag.toPoint;
        }
        overlayOpts.edgeSelection = { from, to };
      }
    }
  }
  if (editor._peerCursors.length > 0) overlayOpts.peerCursors = editor._peerCursors;
  if (editor._peerSelections.length > 0) overlayOpts.peerSelections = editor._peerSelections;
  if (editor._scene.annotations.size > 0) {
    overlayOpts.annotations = [...editor._scene.annotations.values()];
    overlayOpts.selectedAnnotation = editor._selectedAnnotation;
  }
  // "Play" badge on paused animated (GIF) shapes — auto-stopped or held under
  // prefers-reduced-motion. Signals a click resumes them.
  const gifBadges = [];
  for (const shape of editor._scene.shapes.values()) {
    if (shape.type === "image" && shape.animationKind && editor.isPlaybackPaused(shape.id)) {
      gifBadges.push(getElementWorldBounds(shape));
    }
  }
  if (gifBadges.length > 0) overlayOpts.gifBadges = gifBadges;
  // In-canvas text editing: caret + selection highlight for the shape
  // under edit (null when not editing).
  const editingText = editor.editingTextOverlay();
  if (editingText) overlayOpts.editingText = editingText;
  if (editor.debugHitZones) overlayOpts.debugHitZones = true;
  renderOverlay(editor._scene, editor._selection, editor.overlayTarget, overlayOpts);
};
