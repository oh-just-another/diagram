import {
  getLink,
  getLinkPath,
  getElement,
  getElementWorldBounds,
} from "@oh-just-another/scene";
import {
  DEFAULT_LOD,
  renderLinks,
  renderGrid,
  renderScene,
} from "@oh-just-another/renderer-core";
import { renderOverlay, type PortOverlay } from "../overlay.js";
import { anchorOverlayPoints } from "./anchor-points.js";
import {
  ANCHOR_DOT_ACTIVE_RADIUS,
  ANCHOR_DOT_HOVER_GROW_RADIUS,
  ANCHOR_START_HIT_SLOP,
  ISOLATION_DIM_OPACITY,
  LARGE_SCENE_HIT_THRESHOLD,
  LINK_START_ANCHOR_OUTSET,
  LINK_ATTACH_ANCHOR_OUTSET,
} from "../constants.js";
import type { ElementId, Vec2 } from "@oh-just-another/types";

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
      editor._scene.elements.size >= LARGE_SCENE_HIT_THRESHOLD
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
  // Connection anchors. Two roles: link-start (on selection) and link-attach
  // (on hover/proximity). During a drag started FROM a start-anchor (select
  // mode, no tool switch) BOTH are shown: the source keeps its start dots
  // while the target shows its attach dots under the cursor.
  if (editor.mode !== "brush" && editor.mode !== "hand") {
    const zoom = editor._scene.viewport.zoom || 1;
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
      const shape = getElement(editor._scene, shapeId);
      if (!shape) return null;
      const outsetPx = role === "link-start" ? LINK_START_ANCHOR_OUTSET : LINK_ATTACH_ANCHOR_OUTSET;
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
        const attachSet = buildPortSet(t.elementId, "link-attach", t.activeAnchor, t.outlinePoint);
        if (attachSet) portSets.push(attachSet);
      }
    } else if (editor.hoveredLinkTarget) {
      // Proximity snap while a link is drawn with the draw-edge tool.
      const t = editor.hoveredLinkTarget;
      const attachSet = buildPortSet(t.elementId, "link-attach", t.activeAnchor, t.outlinePoint);
      if (attachSet) portSets.push(attachSet);
    } else if (
      !editor.panGesture &&
      !editor.pinch?.isActive() && // `pinch` may be unset during the constructor's first render
      !editor.gestureTx && // hide only during a real drag (tx opens on first move-patch), not on a bare press
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
      const cursor = editor.hoverCursorWorld as Vec2 | null;
      if (editor._selection.size === 1 && cursor) {
        const id = [...editor._selection][0]!;
        const shape = getElement(editor._scene, id);
        if (shape) {
          const b = getElementWorldBounds(shape);
          const pad =
            (LINK_START_ANCHOR_OUTSET + ANCHOR_DOT_ACTIVE_RADIUS + ANCHOR_START_HIT_SLOP) / zoom;
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
              portSets.push(bestI >= 0 ? { ...set, activeIndex: bestI } : set);
            }
          }
        }
      }
    }

    if (portSets.length === 1) overlayOpts.ports = portSets[0]!;
    else if (portSets.length > 1) overlayOpts.ports = portSets;
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
  // Hover highlight for the link under the cursor (skip the selected one —
  // it already shows handles).
  if (editor.hoveredLinkId && editor.hoveredLinkId !== editor._selectedLink) {
    const hovEdge = getLink(editor._scene, editor.hoveredLinkId);
    if (hovEdge) {
      const hovPath = getLinkPath(editor._scene, hovEdge);
      if (hovPath && hovPath.length >= 2) overlayOpts.hoveredLinkPath = hovPath;
    }
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
        // Bend-point handles: existing waypoints (solid) + segment-midpoint
        // "add" handles along the logical [from, ...waypoints, to] chain.
        // Midpoints are hidden during an active waypoint drag to declutter.
        // ELBOW (orthogonal) links don't expose free bend handles — their
        // points are router output, not user-placed (segment-drag editing is
        // a separate mechanic). Only straight / bezier show free waypoints.
        const isElbow = (edge.routing ?? "straight") === "orthogonal";
        if (isElbow) {
          // Segment handles on interior segments of the routed chain
          // (k in 1..len-3; the two terminal segments touch from/to and
          // can't be slid). Hidden during an active segment / endpoint drag.
          const midpoints: Vec2[] = [];
          if (!editor.linkSegmentDrag && !editor.linkEndpointDrag) {
            // Straight elbow → one handle on its single segment (grab to
            // bend). Routed elbow → handles on interior segments.
            const segs =
              path.length === 2
                ? [0]
                : Array.from({ length: Math.max(0, path.length - 3) }, (_, i) => i + 1);
            for (const k of segs) {
              const a = path[k]!;
              const b = path[k + 1]!;
              midpoints.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            }
          }
          overlayOpts.edgeSelection = { from, to, midpoints };
        } else {
          const waypoints = [...(edge.waypoints ?? [])];
          const chain: Vec2[] = [from, ...waypoints, to];
          const midpoints: Vec2[] = [];
          if (!editor.linkWaypointDrag) {
            for (let i = 0; i < chain.length - 1; i++) {
              const a = chain[i]!;
              const b = chain[i + 1]!;
              midpoints.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            }
          }
          overlayOpts.edgeSelection = { from, to, waypoints, midpoints };
        }
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
  for (const shape of editor._scene.elements.values()) {
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
