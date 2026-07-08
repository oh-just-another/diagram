import {
  findContainerAt,
  getAnchorWorld,
  getDropZoneWorld,
  getElement,
  getElementWorldBounds,
  getLink,
  getLinkPath,
  getLinkWaypointMidpoints,
  isFrame,
  isGroup,
  isImage,
  isText,
  updateAnnotation,
} from "@oh-just-another/scene";
import {
  boundsFromPoints,
  interpretPressEnd,
  DRAG_THRESHOLD,
  type PressTarget,
} from "../machine.js";
import { fromPointerEvent, isEditableTarget } from "../dom-events.js";
import * as Selection from "../selection.js";
import * as LinkSelection from "../link-selection.js";
import { getInteractiveHitTester } from "../interactive.js";
import { anchorOverlayPoints } from "./anchor-points.js";
import { snapshotMovingLinks } from "./applies/link-move.js";
import {
  ANCHOR_DOT_ACTIVE_RADIUS,
  LINK_ENDPOINT_HANDLE_RADIUS,
  LINK_START_ANCHOR_OUTSET,
  LONG_PRESS_MAX_MOVEMENT_PX,
  WHEEL_PAN_FACTOR,
  WHEEL_ZOOM_MAX_STEP,
  WHEEL_ZOOM_SPEED,
} from "../constants.js";
import type { Bounds, ElementId, PointerEventData, Vec2 } from "@oh-just-another/types";
import { vec2 } from "@oh-just-another/math";
import { clampZoom } from "./public/zoom-pan.js";
import { req } from "../util.js";
import type { Editor } from "../editor.js";

/** Inclusive integer range `[a..b]`; empty when `b < a`. */
const range = (a: number, b: number): number[] => {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
};

/** True when `p` lies within `√r2` of `center` (squared-distance compare). */
const withinRadiusSq = (p: Vec2, center: Vec2, r2: number): boolean => {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return dx * dx + dy * dy <= r2;
};

// ---------------------------------------------------------------------------
// pointer-DOWN handlers
//
// Each `handleDown*` returns `true` when it consumed the press (the caller
// short-circuits), mirroring the early `return`s of the original monolith.
// The `snapshot*` / `apply*` helpers are the non-short-circuiting tail steps.
// ---------------------------------------------------------------------------

/**
 * Pan-gesture triggers — checked before the normal flow so a right-click or
 * Space/hand + left-click never starts a select/draw gesture. Triggers:
 *   • Right / middle mouse button.
 *   • Left button + Space held.
 *   • Left button in hand mode.
 * Returns true when a pan began (caller short-circuits).
 */
const handleDownPanTrigger = (
  editor: Editor,
  ev: PointerEvent,
  data: PointerEventData,
): boolean => {
  const isRightClick = ev.button === 2 || ev.button === 1;
  const isSpaceLeftDrag = ev.button === 0 && editor.spaceHeld;
  const isHandModeLeftDrag = ev.button === 0 && editor.mode === "hand";
  if (isRightClick || isSpaceLeftDrag || isHandModeLeftDrag) {
    // Suppress the next native contextmenu — we'll either pan (drag) or fire
    // the long-press callback at pointerup (click-style right-click).
    if (isRightClick) editor.suppressNextContextMenu = true;
    editor.beginPanGesture(ev.pointerId, ev.button, data.point);
    return true;
  }
  return false;
};

/**
 * Multi-pointer tracking. Records the pointer, then on the *second* concurrent
 * contact cancels the single-pointer gesture and enters pinch; 3+ contacts are
 * ignored. Returns true when the press was absorbed by pinch handling.
 */
const handleDownMultiPointer = (
  editor: Editor,
  ev: PointerEvent,
  data: PointerEventData,
): boolean => {
  editor.activePointers.set(ev.pointerId, data.point);
  if (editor.activePointers.size === 2) {
    // First touch already kicked off a POINTER_DOWN — undo it so the shape
    // under finger #1 doesn't get dragged when finger #2 lands.
    editor.actor.send({ type: "POINTER_CANCEL" });
    editor.cancelGesture();
    editor.cancelLongPress();
    // A one-finger pan may already be in flight — drop it so it doesn't fight
    // the pinch. No menu fires (touch pan is button 0), so clear directly.
    editor.panGesture = null;
    editor.touchPanCandidate = null;
    editor.beginPinch();
    return true;
  }
  if (editor.activePointers.size > 2) {
    // 3-finger and more: stay in pinch mode but ignore additional contacts.
    return true;
  }
  return false;
};

/**
 * Active in-canvas text edit owns the pointer. A press inside the edited shape
 * repositions the caret (consumed); a press outside commits the edit and falls
 * through (returns false) so the same click does its normal thing.
 */
const handleDownEditingText = (editor: Editor, worldPoint: Vec2): boolean => {
  if (editor.readOnly) return false;
  if (editor.editingTextElement === null) return false;
  if (editor.editedElementContainsPoint(worldPoint)) {
    editor.cancelLongPress();
    editor.setTextCaretFromPoint(worldPoint);
    return true;
  }
  editor.commitTextEdit();
  // fall through to normal press handling for this click
  return false;
};

/** Brush mode owns the gesture end-to-end — start a stroke, skip machine. */
const handleDownBrush = (editor: Editor, worldPoint: Vec2, pressure: number): boolean => {
  if (editor.readOnly) return false;
  if (editor.mode !== "brush") return false;
  editor.beginBrushStroke(worldPoint, pressure);
  return true;
};

/**
 * Text tool — a click places a new empty text shape (or edits an existing one
 * under the press) and opens the inline editor straight away.
 */
const handleDownDrawText = (editor: Editor, worldPoint: Vec2): boolean => {
  if (editor.readOnly) return false;
  if (editor.mode !== "draw-text") return false;
  editor.cancelLongPress();
  const hit = editor.hitTest(worldPoint);
  const existing = hit.kind === "element" ? getElement(editor._scene, hit.id) : undefined;
  if (existing !== undefined && isText(existing)) {
    editor._selection = Selection.single(existing.id);
    editor.beginTextEdit(existing.id);
    editor.notify();
  } else {
    editor.createTextAt(worldPoint);
  }
  return true;
};

/**
 * Annotation pin drag — when the press lands on a pin, take over the gesture
 * entirely (skip machine, skip interactive testers).
 */
const handleDownAnnotation = (editor: Editor, worldPoint: Vec2): boolean => {
  if (editor.readOnly) return false;
  const annHit = editor.hitAnnotation(worldPoint);
  if (!annHit) return false;
  const ann = editor._scene.annotations.get(annHit);
  if (!ann) return false;
  editor.annotationDrag = {
    id: annHit,
    originPosition: { ...ann.position },
    originWorldPoint: worldPoint,
    moved: false,
  };
  editor.setSelectedAnnotation(annHit);
  return true;
};

/**
 * Interactive sub-element check: when the press lands on a shape whose type has
 * a registered hit-tester and the tester finds an interactive node, fire its
 * emit and skip the normal press flow.
 */
const handleDownInteractiveHit = (editor: Editor, worldPoint: Vec2): boolean => {
  const topElement = editor.acceleratedElementAt(worldPoint);
  if (!topElement) return false;
  const tester = getInteractiveHitTester(topElement.type);
  if (!tester) return false;
  const local = {
    x: worldPoint.x - topElement.position.x,
    y: worldPoint.y - topElement.position.y,
  };
  const emit = tester(topElement, local);
  if (emit) {
    editor.applyEmit(emit);
    return true;
  }
  return false;
};

/**
 * Elbow segment drag: a press on an interior segment's midpoint handle moves
 * the whole segment perpendicular. Checked before the hit-test so it isn't read
 * as deselect.
 */
const handleDownSegmentDrag = (editor: Editor, worldPoint: Vec2): boolean => {
  if (editor.readOnly) return false;
  const segDragLink = editor.selectedLink;
  if (!(editor.mode === "select" && segDragLink)) return false;
  const edge = getLink(editor._scene, segDragLink);
  if (!(edge && (edge.routing ?? "straight") === "orthogonal")) return false;
  const path = getLinkPath(editor._scene, edge);
  if (!(path && path.length >= 2)) return false;
  const zoom = editor._scene.viewport.zoom || 1;
  const r = LINK_ENDPOINT_HANDLE_RADIUS / zoom;
  const r2 = r * r;
  // Draggable segments: the single segment of a straight elbow (grab to bend it
  // → insert), or interior segments k in 1..len-3 of a routed elbow (terminal
  // stubs touch from/to and aren't slid).
  const segs = path.length === 2 ? [0] : range(1, path.length - 3);
  for (const k of segs) {
    const a = req(path[k]);
    const b = req(path[k + 1]);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = mx - worldPoint.x;
    const dy = my - worldPoint.y;
    if (dx * dx + dy * dy <= r2) {
      const axis = Math.abs(a.y - b.y) < 1e-6 ? "h" : "v";
      const at = axis === "h" ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
      const pos = axis === "h" ? a.y : a.x; // pinned perpendicular coord
      // Double-click a segment handle → drop its pin (back to auto route).
      if (editor.isHandleDoubleClick(worldPoint)) {
        editor.resetSegmentPin(segDragLink, axis, pos, at);
      } else {
        editor.beginSegmentDrag(segDragLink, axis, at);
      }
      editor.cancelLongPress();
      return true;
    }
  }
  return false;
};

/**
 * Bend-point (waypoint) drag on the selected link. A press on an existing
 * waypoint handle moves it; a press on a segment-midpoint handle inserts a new
 * waypoint there (on first move). Checked before the normal hit-test.
 */
const handleDownWaypointDrag = (editor: Editor, worldPoint: Vec2): boolean => {
  if (editor.readOnly) return false;
  const wpDragLink = editor.selectedLink;
  if (!(editor.mode === "select" && wpDragLink)) return false;
  const edge = getLink(editor._scene, wpDragLink);
  // Elbow links use segment-drag (separate mechanic), not free waypoints.
  const path =
    edge && (edge.routing ?? "straight") !== "orthogonal" ? getLinkPath(editor._scene, edge) : null;
  if (!(edge && path && path.length >= 2)) return false;
  const zoom = editor._scene.viewport.zoom || 1;
  const r = LINK_ENDPOINT_HANDLE_RADIUS / zoom;
  const r2 = r * r;
  const waypoints: Vec2[] = [...(edge.waypoints ?? [])];
  // Existing waypoints take priority over the midpoint "add" handles.
  let grabbed = false;
  for (let i = 0; i < waypoints.length; i++) {
    if (withinRadiusSq(req(waypoints[i]), worldPoint, r2)) {
      // Double-click a waypoint handle → delete the bend point.
      if (editor.isHandleDoubleClick(worldPoint)) {
        editor.deleteWaypoint(wpDragLink, i);
      } else {
        editor.beginWaypointDrag(wpDragLink, i, false);
      }
      grabbed = true;
      break;
    }
  }
  if (!grabbed) {
    // "Add waypoint" handles sit on the drawn arc (bezier) / chord (straight) —
    // same geometry the overlay renders, so the click target matches.
    const mids = getLinkWaypointMidpoints(editor._scene, edge) ?? [];
    for (let i = 0; i < mids.length; i++) {
      if (withinRadiusSq(req(mids[i]), worldPoint, r2)) {
        editor.beginWaypointDrag(wpDragLink, i, true);
        grabbed = true;
        break;
      }
    }
  }
  if (grabbed) {
    editor.cancelLongPress();
    return true;
  }
  return false;
};

/**
 * Begin a link FROM a start dot of `shapeId` (connection dots only on the
 * selected shape). The dots sit OUTSIDE the shape; they're grabbable exactly
 * where the overlay draws them (shared `anchorOverlayPoints`). Returns true when
 * a link-from-anchor drag started.
 */
const tryAnchorDrag = (editor: Editor, shapeId: ElementId, worldPoint: Vec2): boolean => {
  const shape = getElement(editor._scene, shapeId);
  if (!shape) return false;
  const zoom = editor._scene.viewport.zoom || 1;
  const { names, worldPoints } = anchorOverlayPoints(shape, LINK_START_ANCHOR_OUTSET / zoom);
  const grab = (ANCHOR_DOT_ACTIVE_RADIUS + editor.anchorStartHitSlop) / zoom;
  let bestName: string | null = null;
  let bestD2 = grab * grab;
  for (let i = 0; i < worldPoints.length; i++) {
    const p = req(worldPoints[i]);
    const dx = p.x - worldPoint.x;
    const dy = p.y - worldPoint.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      bestName = req(names[i]);
    }
  }
  if (bestName === null) return false;
  editor.cancelLongPress();
  editor.linkDragFromAnchor = {
    fromElement: shapeId,
    fromWorld: getAnchorWorld(shape, { kind: "named", name: bestName }),
    anchorName: bestName,
    origin: worldPoint,
    moved: false,
  };
  return true;
};

/**
 * Link-start anchor drag: a press on one of the single selected element's
 * link-start dots begins an edge FROM that anchor. Checked before the normal
 * hit-test / auto-select. Modifier-clicks fall through to normal select; the
 * rotate grip (floating above the top anchor) must win, so it's excluded.
 */
const handleDownAnchorStart = (
  editor: Editor,
  data: PointerEventData,
  worldPoint: Vec2,
  target: PressTarget,
): boolean => {
  if (editor.readOnly) return false;
  if (
    !(
      editor.mode === "select" &&
      !data.modifiers.shift &&
      !data.modifiers.meta &&
      !data.modifiers.ctrl &&
      target.kind !== "rotate-handle"
    )
  ) {
    return false;
  }
  const selId = editor._selection.size === 1 ? [...editor._selection][0] : null;
  if (selId && tryAnchorDrag(editor, selId, worldPoint)) return true;
  return false;
};

/**
 * Auto-select on press for shapes/edges the user is about to act on. Pressing
 * an unselected element promotes it BEFORE the drag; Shift/Cmd extends instead
 * of replacing. Cmd/Ctrl-click on a linked shape is a link-open gesture (handled
 * on up), NOT additive select — so selection is left untouched there.
 */
const applyAutoSelect = (editor: Editor, data: PointerEventData, target: PressTarget): void => {
  const linkModifier = data.modifiers.meta || data.modifiers.ctrl;
  const isLinkOpen =
    linkModifier && target.kind === "element" && editor.elementLink(target.id) !== null;
  if (!isLinkOpen && target.kind === "element" && !editor._selection.has(target.id)) {
    const additive = data.modifiers.shift || data.modifiers.meta || data.modifiers.ctrl;
    editor._selection = additive
      ? Selection.add(editor._selection, target.id)
      : Selection.single(target.id);
    // Remember an additive promotion so a tap's up-handler doesn't
    // SELECT_TOGGLE it back off.
    if (additive) editor.additivePressAdded = target.id;
    // Plain press replaces the whole selection, so drop any selected links; an
    // additive press keeps them.
    if (!additive && editor._selectedLinks.size > 0) {
      editor._selectedLinks = LinkSelection.EMPTY;
    }
    editor.notify();
  }
};

/**
 * ⌥-drag duplicate: holding Alt and pressing a selected element clones the
 * whole selection IN PLACE; the drag then moves the clones, leaving originals.
 * Returns the (possibly re-pointed) press target so the snapshot drags the clone.
 */
const applyAltDragDuplicate = (
  editor: Editor,
  data: PointerEventData,
  target: PressTarget,
): PressTarget => {
  if (editor.readOnly) return target;
  if (
    data.modifiers.alt &&
    editor.mode === "select" &&
    target.kind === "element" &&
    editor._selection.has(target.id)
  ) {
    const clone = editor.duplicateSelectedInPlace(target.id);
    if (clone !== null) return { kind: "element", id: clone, bounds: target.bounds };
  }
  return target;
};

/** Recursively add a group and all its descendants to `ids`. */
const addGroupDescendants = (editor: Editor, parentId: ElementId, ids: Set<ElementId>): void => {
  if (ids.has(parentId)) return;
  ids.add(parentId);
  for (const child of editor._scene.elements.values()) {
    if (child.parentId === parentId) addGroupDescendants(editor, child.id, ids);
  }
};

/**
 * Snapshot positions for the upcoming multi-shape drag. Populated when the press
 * lands on an already-selected shape (drag the whole selection with descendants)
 * or on a group/frame (drag it and its members).
 */
const snapshotGroupMove = (editor: Editor, target: PressTarget): void => {
  if (target.kind === "element") {
    const pressedElement = getElement(editor._scene, target.id);
    const pressedIsGroup = pressedElement !== undefined && isGroup(pressedElement);
    const pressedIsFrame = pressedElement !== undefined && isFrame(pressedElement);
    const inSelection = editor._selection.has(target.id);
    if (inSelection || pressedIsGroup || pressedIsFrame) {
      const ids = new Set<ElementId>();
      if (inSelection) {
        // Locked / layer-locked elements stay put (still selectable).
        for (const id of editor.expandSelectionWithDescendants()) {
          const s = getElement(editor._scene, id);
          if (s && editor.isElementManipulable(s)) ids.add(id);
        }
      }
      if (pressedIsGroup) {
        addGroupDescendants(editor, target.id, ids);
      }
      if (pressedIsFrame) {
        // Frame drag pulls every shape with matching frameId along. Frames are
        // flat associations — no recursive descent needed.
        ids.add(target.id);
        for (const s of editor._scene.elements.values()) {
          if (s.frameId === target.id) ids.add(s.id);
        }
      }
      // Links that ride along: selected links (moved whole) + connectors bound
      // on both ends to the dragged elements. Snapshotted at press.
      const movingLinks = snapshotMovingLinks(editor._scene, ids, editor._selectedLinks);
      // Start a group drag for a real multi-selection OR whenever links need to
      // ride along (even with a single dragged element).
      if (ids.size > 1 || movingLinks.size > 0) {
        const snap = new Map<ElementId, Vec2>();
        for (const id of ids) {
          const s = getElement(editor._scene, id);
          if (s) snap.set(id, s.position);
        }
        editor.groupMoveOrigin = snap;
        editor.groupLinkMoveOrigin = movingLinks.size > 0 ? movingLinks : null;
      } else {
        editor.groupMoveOrigin = null;
        editor.groupLinkMoveOrigin = null;
      }
    } else {
      editor.groupMoveOrigin = null;
      editor.groupLinkMoveOrigin = null;
    }
  } else {
    editor.groupMoveOrigin = null;
  }
};

/**
 * Snapshot each member's world bounds + position + scale when the press lands on
 * a group-handle so the per-frame resize math has a stable baseline.
 */
const snapshotGroupResize = (editor: Editor, target: PressTarget): void => {
  if (target.kind === "group-handle") {
    const elements = new Map<ElementId, { position: Vec2; bounds: Bounds; scale: Vec2 }>();
    for (const id of editor.expandSelectionWithDescendants()) {
      const s = getElement(editor._scene, id);
      if (!s) continue;
      elements.set(id, {
        position: s.position,
        bounds: getElementWorldBounds(s),
        scale: s.scale,
      });
    }
    // Links that scale with the box: selected links + connectors bound on both
    // ends to the resized elements (same set as the move snapshot).
    const links = snapshotMovingLinks(
      editor._scene,
      new Set(elements.keys()),
      editor._selectedLinks,
    );
    editor.groupResizeOrigin = { combined: target.bounds, elements, links };
  } else {
    editor.groupResizeOrigin = null;
  }
};

/**
 * Snapshot every member's pose when the press lands on the rotate grip, so the
 * per-frame rotate math turns from a stable baseline.
 */
const snapshotRotate = (editor: Editor, target: PressTarget): void => {
  if (target.kind === "rotate-handle") {
    const origin = new Map<ElementId, { position: Vec2; rotation: number }>();
    for (const id of editor.expandSelectionWithDescendants()) {
      const s = getElement(editor._scene, id);
      if (s) origin.set(id, { position: s.position, rotation: s.rotation });
    }
    editor.rotateGestureOrigin = { pivot: target.pivot, origin };
  } else {
    editor.rotateGestureOrigin = null;
  }
};

// ---------------------------------------------------------------------------
// pointer-MOVE handlers
// ---------------------------------------------------------------------------

/**
 * Pan gesture in flight — translate cursor delta to a screen pan and
 * short-circuit. Doesn't touch the machine.
 */
const handleMovePan = (editor: Editor, ev: PointerEvent, data: PointerEventData): boolean => {
  const pan = editor.panGesture;
  if (pan?.pointerId !== ev.pointerId) return false;
  const dx = data.point.x - pan.lastPoint.x;
  const dy = data.point.y - pan.lastPoint.y;
  pan.lastPoint = data.point;
  // Mark as moved once total displacement crosses slop — used at pointerup to
  // decide context-menu vs drag for right-click gestures.
  if (!pan.moved && vec2.distance(pan.startPoint, data.point) > LONG_PRESS_MAX_MOVEMENT_PX) {
    pan.moved = true;
  }
  // Natural-grab direction: `viewportPanBy` already subtracts deltaScreen from
  // pan, so pass the raw cursor delta — no extra inversion.
  editor.panBy({ x: dx, y: dy });
  return true;
};

/**
 * Update the tracked pointer position; in pinch mode recompute the gesture and
 * short-circuit before the machine sees the move.
 */
const handleMovePinch = (editor: Editor, ev: PointerEvent, data: PointerEventData): boolean => {
  if (editor.activePointers.has(ev.pointerId)) {
    editor.activePointers.set(ev.pointerId, data.point);
  }
  if (editor.pinch.isActive()) {
    editor.applyPinch();
    return true;
  }
  return false;
};

/**
 * One-finger pan: an armed touch press on empty canvas that has now dragged past
 * slop becomes a pan (not a marquee lasso).
 */
const handleMoveOneFingerPan = (
  editor: Editor,
  ev: PointerEvent,
  data: PointerEventData,
): boolean => {
  if (
    editor.touchPanCandidate !== null &&
    editor.activePointers.size === 1 &&
    vec2.distance(editor.touchPanCandidate, data.point) > LONG_PRESS_MAX_MOVEMENT_PX
  ) {
    const origin = editor.touchPanCandidate;
    editor.touchPanCandidate = null;
    editor.beginPanGesture(ev.pointerId, ev.button, origin);
    const pan = editor.panGesture;
    if (pan) {
      pan.moved = true;
      editor.panBy({ x: data.point.x - origin.x, y: data.point.y - origin.y });
      pan.lastPoint = data.point;
    }
    return true;
  }
  return false;
};

/** Host-managed elbow segment drag of the selected link. */
const handleMoveSegmentDrag = (editor: Editor, worldPoint: Vec2): boolean => {
  if (!editor.isDraggingSegment) return false;
  editor.updateSegmentDrag(worldPoint);
  return true;
};

/** Host-managed waypoint (bend-point) drag of the selected link. */
const handleMoveWaypointDrag = (editor: Editor, worldPoint: Vec2): boolean => {
  if (!editor.isDraggingWaypoint) return false;
  editor.updateWaypointDrag(worldPoint);
  return true;
};

/**
 * Link drag started from a start-anchor (select mode, no tool switch).
 * Host-managed end-to-end — the machine never saw a POINTER_DOWN. Gated on the
 * drag threshold so a click that barely moves is not a draw.
 */
const handleMoveLinkAnchorDrag = (editor: Editor, worldPoint: Vec2): boolean => {
  const drag = editor.linkDragFromAnchor;
  if (!drag) return false;
  if (!drag.moved) {
    const dx = worldPoint.x - drag.origin.x;
    const dy = worldPoint.y - drag.origin.y;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return true;
    drag.moved = true;
  }
  editor.applyLinkPreview(drag.fromElement, drag.fromWorld, worldPoint);
  editor.updateHoveredLinkTarget(worldPoint);
  return true;
};

/** Drag-select inside the edited text shape. */
const handleMoveTextDragSelect = (editor: Editor, worldPoint: Vec2): boolean => {
  if (!(editor.editingTextElement !== null && editor.isTextDragging)) return false;
  editor.extendTextSelectionToPoint(worldPoint);
  return true;
};

/** Brush stroke in progress — append a vertex and skip everything else. */
const handleMoveBrush = (editor: Editor, worldPoint: Vec2, pressure: number): boolean => {
  if (!editor.brushStroke) return false;
  editor.extendBrushStroke(worldPoint, pressure);
  return true;
};

/**
 * Container drop preview: while dragging a single shape, find the topmost
 * container under cursor (excluding the dragged shape and its descendants) and
 * stash the drop-zone for the overlay. Non-short-circuiting.
 */
const updateContainerDropPreview = (editor: Editor, worldPoint: Vec2): void => {
  if (!editor.dragElementId) return;
  const dragged = editor.dragElementId;
  const exclude = new Set<ElementId>([dragged]);
  // Don't drop a container onto itself or into one of its own descendants.
  for (const s of editor._scene.elements.values()) {
    let cursor = s.parentId;
    for (let i = 0; cursor && i < 64; i++) {
      if (cursor === dragged) {
        exclude.add(s.id);
        break;
      }
      cursor = editor._scene.elements.get(cursor)?.parentId;
    }
  }
  const container = findContainerAt(editor._scene, worldPoint, exclude);
  if (container) {
    const zone = getDropZoneWorld(container);
    if (zone) {
      const next = { id: container.id, dropZone: zone };
      if (
        editor.containerHover?.id !== next.id ||
        editor.containerHover.dropZone !== next.dropZone
      ) {
        editor.containerHover = next;
        editor.notify();
      }
    }
  } else if (editor.containerHover !== null) {
    editor.containerHover = null;
    editor.notify();
  }
};

/**
 * Annotation drag — update annotation position from delta. No patches per-move;
 * commit on pointerup so undo is one step.
 */
const handleMoveAnnotationDrag = (editor: Editor, worldPoint: Vec2): boolean => {
  const drag = editor.annotationDrag;
  if (!drag) return false;
  const dx = worldPoint.x - drag.originWorldPoint.x;
  const dy = worldPoint.y - drag.originWorldPoint.y;
  if (dx !== 0 || dy !== 0) drag.moved = true;
  const ann = editor._scene.annotations.get(drag.id);
  if (ann) {
    // Mutate via apply to keep render in sync; final commit on up rewrites the
    // patch from origin to final.
    const newPos = { x: drag.originPosition.x + dx, y: drag.originPosition.y + dy };
    const next = { ...ann, position: newPos };
    const annotations = new Map(editor._scene.annotations);
    annotations.set(drag.id, next);
    editor._scene = { ...editor._scene, annotations };
    editor.notify();
  }
  return true;
};

/**
 * Idle / drawing tail of onMove: fan out the cursor, update rubber-band /
 * draw-edge previews and idle hover affordances, then send POINTER_MOVE.
 */
const dispatchMoveToMachine = (editor: Editor, worldPoint: Vec2): void => {
  // Fan out to anyone listening for the local cursor — `@collab` broadcasts it
  // via awareness. Subscribers throttle if they care.
  for (const fn of editor.cursorListeners) fn(worldPoint);
  const ctx = editor.actor.getSnapshot().context;
  if (
    ctx.pressOrigin &&
    ctx.mode !== "select" &&
    ctx.mode !== "draw-edge" &&
    editor.isDrawingPhase(ctx)
  ) {
    // Update rubber-band preview live for rect / ellipse drawing.
    editor.drawingPreview = boundsFromPoints(ctx.pressOrigin, worldPoint);
  }
  // Port-overlay tracking in draw-edge mode — both when idle and during gesture.
  if (ctx.mode === "draw-edge") {
    editor.updateHoveredLinkTarget(worldPoint);
  } else if (editor.hoveredLinkTarget !== null) {
    editor.hoveredLinkTarget = null;
    editor.notify();
  }
  // Hover-to-play: while idle and directly over an animated image, signal hover
  // so a paused GIF can resume.
  if (!ctx.pressOrigin) {
    const hov = editor.hitTest(worldPoint);
    const directHs = hov.kind === "element" ? editor._scene.elements.get(hov.id) : undefined;
    editor.hoverAnimatedElement(
      directHs && isImage(directHs) && directHs.animationKind ? directHs.id : null,
    );
    // Track the idle cursor so the SINGLE selected element's link-start dot
    // grows by proximity. Only the selected element's dots react.
    editor.setHoverCursorWorld(editor.mode === "select" ? worldPoint : null);
  }
  editor.actor.send({ type: "POINTER_MOVE", point: worldPoint });
};

// ---------------------------------------------------------------------------
// pointer-UP handlers
// ---------------------------------------------------------------------------

/** Pan gesture ends — clean up cursor and state, skip the rest. */
const handleUpPan = (editor: Editor, ev: PointerEvent): boolean => {
  if (editor.panGesture?.pointerId !== ev.pointerId) return false;
  editor.endPanGesture();
  return true;
};

/**
 * Exit pinch when the second-to-last finger lifts. The surviving touch does NOT
 * resume as a single-finger drag (machine was cancelled on pinch entry).
 */
const handleUpPinch = (editor: Editor): boolean => {
  if (!editor.pinch.isActive()) return false;
  if (editor.activePointers.size < 2) editor.pinch.end();
  return true;
};

/** Commit a host-managed elbow segment drag (one undo step). */
const handleUpSegmentDrag = (editor: Editor): boolean => {
  if (!editor.isDraggingSegment) return false;
  editor.endSegmentDrag();
  return true;
};

/** Commit a host-managed waypoint drag (collapses if dropped onto the line). */
const handleUpWaypointDrag = (editor: Editor): boolean => {
  if (!editor.isDraggingWaypoint) return false;
  editor.endWaypointDrag();
  return true;
};

/**
 * Commit a link drag that began from a start-anchor. If it moved past the
 * threshold, create the edge. If not, distinguish a click exactly ON the dot
 * (spawn a new element + link) from a click in the wider grab halo (normal
 * select / deselect). Either way clear the preview/hover.
 */
const handleUpLinkAnchorDrag = (editor: Editor, ev: PointerEvent): boolean => {
  const drag = editor.linkDragFromAnchor;
  if (!drag) return false;
  editor.linkDragFromAnchor = null;
  const upData = fromPointerEvent(ev, editor.host);
  const upWorld = editor.screenToWorld(upData.point);
  if (drag.moved) {
    const upHit = editor.hitTest(upWorld);
    const toElement = upHit.kind === "element" ? upHit.id : null;
    editor.applyEmit({
      type: "CREATE_EDGE",
      fromElement: drag.fromElement,
      toElement,
      fromPoint: drag.fromWorld,
      toPoint: upWorld,
    });
  } else {
    // A click, not a draw. If it landed exactly ON the dot (narrow radius),
    // spawn a new element + link in that dot's direction. Otherwise it was a
    // click in the wider grab halo → normal select / deselect by hit-test.
    const selShape = getElement(editor._scene, drag.fromElement);
    const zoom = editor._scene.viewport.zoom || 1;
    let onDot = false;
    if (selShape) {
      const { names, worldPoints } = anchorOverlayPoints(selShape, LINK_START_ANCHOR_OUTSET / zoom);
      const idx = names.indexOf(drag.anchorName);
      if (idx >= 0) {
        const dp = req(worldPoints[idx]);
        const r = editor.anchorClickRadius / zoom;
        const dx = dp.x - drag.origin.x;
        const dy = dp.y - drag.origin.y;
        onDot = dx * dx + dy * dy <= r * r;
      }
    }
    if (onDot) {
      editor.createLinkedElementFromAnchor(drag.fromElement, drag.anchorName);
    } else {
      const upHit = editor.hitTest(upWorld);
      if (upHit.kind === "empty") editor.applyEmit({ type: "SELECT_CLEAR" });
      else if (upHit.kind === "element") editor.applyEmit({ type: "SELECT_REPLACE", id: upHit.id });
      else if (upHit.kind === "link")
        editor.applyEmit({ type: "SELECT_EDGE_REPLACE", id: upHit.id });
    }
  }
  editor.edgePreview = null;
  editor.hoveredLinkTarget = null;
  editor.notify();
  return true;
};

/** End an in-canvas text drag-select. */
const handleUpTextDragSelect = (editor: Editor): boolean => {
  if (!(editor.editingTextElement !== null && editor.isTextDragging)) return false;
  editor.endTextDragSelect();
  return true;
};

/** Commit brush stroke if one is in progress. */
const handleUpBrush = (editor: Editor): boolean => {
  if (!editor.brushStroke) return false;
  editor.commitBrushStroke();
  return true;
};

/**
 * Annotation drag commit — issue a single patch from origin to final position so
 * history has one undo step.
 */
const handleUpAnnotationDrag = (editor: Editor): boolean => {
  const drag = editor.annotationDrag;
  if (!drag) return false;
  editor.annotationDrag = null;
  if (drag.moved) {
    const final = editor._scene.annotations.get(drag.id);
    if (final) {
      // Reset to origin, then issue patch with proper before/after.
      const origin = { ...final, position: drag.originPosition };
      const annotations = new Map(editor._scene.annotations);
      annotations.set(drag.id, origin);
      editor._scene = { ...editor._scene, annotations };
      const r = updateAnnotation(editor._scene, drag.id, () => final);
      editor._scene = r.scene;
      editor._history.push(r.patch);
      editor.notify();
    }
  }
  return true;
};

/**
 * Cmd/Ctrl-click on a linked element (a tap, not a drag) opens its href — onDown
 * already skipped the additive-select promote for this case, so selection is
 * untouched. Returns true when a link was opened.
 */
const handleUpLinkOpen = (editor: Editor, data: PointerEventData, worldPoint: Vec2): boolean => {
  const origin = editor.actor.getSnapshot().context.pressOrigin;
  const linkMod = data.modifiers.meta || data.modifiers.ctrl;
  if (origin && linkMod) {
    const zoom = editor._scene.viewport.zoom || 1;
    const movedPx = Math.hypot(worldPoint.x - origin.x, worldPoint.y - origin.y) * zoom;
    if (movedPx < LONG_PRESS_MAX_MOVEMENT_PX) {
      const hit = editor.hitTest(worldPoint);
      if (hit.kind === "element") {
        const href = editor.elementLink(hit.id);
        if (href) {
          editor.openLink(href);
          editor.actor.send({ type: "POINTER_UP", point: worldPoint });
          editor.commitGesture();
          return true;
        }
      }
    }
  }
  return false;
};

/**
 * Normal pointer-up tail: fire the click-style effect, route group-isolation,
 * dispatch POINTER_UP to the machine, apply container/frame reparenting, commit
 * the gesture, then handle GIF-tap playback and the idle cursor.
 */
const handleUpCommit = (editor: Editor, worldPoint: Vec2): void => {
  // First, fire any click-style effect derived from the press context.
  const ctxBeforeUp = editor.actor.getSnapshot().context;
  let clickEffect = interpretPressEnd(ctxBeforeUp, worldPoint);
  // A shift/meta TAP on a shape the press already added additively must NOT
  // toggle it back off — the press handled the add, this would undo it.
  if (clickEffect?.type === "SELECT_TOGGLE" && editor.additivePressAdded === clickEffect.id) {
    clickEffect = null;
  }
  editor.additivePressAdded = null;

  // Group isolation routing overrides what `interpretPressEnd` produced.
  const handledByIsolation = editor.routeIsolationClick(clickEffect, worldPoint);
  if (!handledByIsolation && clickEffect) {
    editor.applyEmit(clickEffect);
  }

  editor.drawingPreview = null;
  // Provide the up-side hit-test when the gesture cares about where it lands:
  // drawing a new edge (normal hit-test resolves the drop), or re-binding an
  // existing endpoint (element-only attach hit-test so the drop binds to the
  // shape / anchor rather than the dragged endpoint handle at the cursor).
  let upTarget: ReturnType<typeof editor.hitTest> | undefined;
  if (ctxBeforeUp.mode === "draw-edge") {
    upTarget = editor.hitTest(worldPoint);
  } else if (ctxBeforeUp.pressTarget?.kind === "edge-endpoint") {
    upTarget = editor.linkAttachTargetAt(worldPoint);
  }
  editor.actor.send(
    upTarget !== undefined
      ? { type: "POINTER_UP", point: worldPoint, target: upTarget }
      : { type: "POINTER_UP", point: worldPoint },
  );
  // Container reparent / drag-out and frame membership — both before commit so
  // the parentId / autoGrow / frameId patches land in the same undo step.
  editor.applyContainerDrop(worldPoint);
  editor.reconcileFrameMembership();
  editor.commitGesture();

  // A tap (not a drag) on an animated image toggles its GIF playback. Gated on
  // near-zero displacement so it never fires at the end of a drag.
  const origin = ctxBeforeUp.pressOrigin;
  if (origin) {
    const zoom = editor._scene.viewport.zoom || 1;
    const movedPx = Math.hypot(worldPoint.x - origin.x, worldPoint.y - origin.y) * zoom;
    if (movedPx < LONG_PRESS_MAX_MOVEMENT_PX) {
      const hit = editor.hitTest(worldPoint);
      if (hit.kind === "element") {
        const s = editor._scene.elements.get(hit.id);
        if (s && isImage(s) && s.animationKind) editor.togglePlayback(s.id);
      }
    }
  }
  // The gesture is over — recompute the cursor for the now-idle hover state.
  editor.refreshCursor(worldPoint);
};

// ---------------------------------------------------------------------------
// wheel handlers
// ---------------------------------------------------------------------------

/**
 * Zoom around `screenPoint` from the wheel's `deltaY`. The raw delta is clamped
 * to MAX_STEP so a mouse-wheel notch is a calm ~10 % step, while trackpad pinch
 * events (|deltaY| of 2–5) bypass the clamp and stay granular for smooth zooms.
 */
const applyWheelZoom = (editor: Editor, ev: WheelEvent, screenPoint: Vec2): void => {
  if (ev.deltaY === 0) return;
  const clampedDelta =
    Math.abs(ev.deltaY) > WHEEL_ZOOM_MAX_STEP
      ? WHEEL_ZOOM_MAX_STEP * Math.sign(ev.deltaY)
      : ev.deltaY;
  const factor = 1 - (clampedDelta * WHEEL_ZOOM_SPEED) / 100;
  if (factor <= 0) return;
  const currentZoom = editor._scene.viewport.zoom;
  const nextZoom = clampZoom(currentZoom * factor);
  if (nextZoom === currentZoom) return;
  const anchor = editor.screenToWorld(screenPoint);
  editor.zoomAt(nextZoom / currentZoom, anchor);
};

/**
 * Pan both axes from the wheel deltas. Shift + vertical-only wheel maps the
 * vertical delta to horizontal pan. `panBy` subtracts deltaScreen from pan, so
 * the wheel delta is negated to match native browser scroll feel.
 */
const applyWheelPan = (editor: Editor, ev: WheelEvent): void => {
  let dx = ev.deltaX;
  let dy = ev.deltaY;
  if (ev.shiftKey && dx === 0) {
    dx = dy;
    dy = 0;
  }
  editor.panBy({ x: -dx * WHEEL_PAN_FACTOR, y: -dy * WHEEL_PAN_FACTOR });
};

/**
 * Pointer + wheel event binding. Owns the branchy dispatch — pan / pinch /
 * brush / annotation / interactive-hit / machine flow — delegating each case to
 * the module-level handlers above so no single handler is a monolith.
 *
 * Returns an unsubscribe function that removes every listener it installed.
 *
 * Typed against the full `Editor` class (type-only import — erased at runtime,
 * so no import cycle and dependency-cruiser ignores it). This handler reaches
 * deep into Editor's surface, so the members it touches are declared `public`
 * (with the `_`-prefix convention marking them internal). editor.ts is the only
 * call site.
 */
export const bindPointerEvents = (editor: Editor): (() => void) => {
  const onDown = (ev: PointerEvent) => {
    ev.preventDefault();
    editor.host.setPointerCapture(ev.pointerId);
    // Give the canvas keyboard focus on press. `preventDefault` above suppresses
    // the browser's default focus-on-pointerdown, so without this the surface
    // never focuses by clicking. Skipped when the press lands on a text field
    // (in-canvas text editing) so it keeps its own focus.
    if (typeof editor.host.focus === "function" && !isEditableTarget(ev.target)) {
      editor.host.focus({ preventScroll: true });
    }
    const data = fromPointerEvent(ev, editor.host);
    // Fresh press — forget any additive promotion from the last gesture.
    editor.additivePressAdded = null;

    // Pan detection must come BEFORE the normal flow, and multi-pointer pinch
    // tracking BEFORE the machine sees a single-pointer gesture.
    if (handleDownPanTrigger(editor, ev, data)) return;
    if (handleDownMultiPointer(editor, ev, data)) return;

    // Schedule a long-press fire — cancelled by movement or release.
    editor.startLongPress(data.point);
    const worldPoint = editor.screenToWorld(data.point);

    // Mode / target-specific take-overs (each short-circuits when it consumes
    // the press). Order matters — it mirrors the original monolith exactly.
    if (handleDownEditingText(editor, worldPoint)) return;
    if (handleDownBrush(editor, worldPoint, ev.pressure)) return;
    if (handleDownDrawText(editor, worldPoint)) return;
    if (handleDownAnnotation(editor, worldPoint)) return;
    if (handleDownInteractiveHit(editor, worldPoint)) return;
    if (handleDownSegmentDrag(editor, worldPoint)) return;
    if (handleDownWaypointDrag(editor, worldPoint)) return;

    // Resolve the press target up-front so the anchor-drag path can defer to the
    // rotate grip (which floats above the top anchor's grab zone).
    let target = editor.hitTest(worldPoint);
    if (handleDownAnchorStart(editor, data, worldPoint, target)) return;

    applyAutoSelect(editor, data, target);
    // ⌥-drag duplicate runs after auto-select so the press target is in the
    // selection; `target` re-points to the clone so the snapshot drags it.
    target = applyAltDragDuplicate(editor, data, target);

    // Track the dragged shape id for container drop / drag-out logic on
    // pointerup. Cleared in onUp / cancel.
    editor.dragElementId = target.kind === "element" ? target.id : null;
    editor.containerHover = null;

    snapshotGroupMove(editor, target);
    snapshotGroupResize(editor, target);
    snapshotRotate(editor, target);

    // Arm one-finger pan: a TOUCH press on empty canvas in select mode. A tap
    // still deselects via the machine below; onMove promotes this to a pan once
    // the finger drags past slop.
    editor.touchPanCandidate =
      data.kind === "touch" && editor.mode === "select" && target.kind === "empty"
        ? data.point
        : null;

    editor.actor.send({
      type: "POINTER_DOWN",
      point: worldPoint,
      target,
      modifiers: data.modifiers,
    });
  };

  const onMove = (ev: PointerEvent) => {
    const data = fromPointerEvent(ev, editor.host);

    if (handleMovePan(editor, ev, data)) return;
    if (handleMovePinch(editor, ev, data)) return;
    if (handleMoveOneFingerPan(editor, ev, data)) return;

    // Cancel long-press timer if the finger has moved beyond slop.
    editor.longPress.cancelIfMovedBeyond(data.point, LONG_PRESS_MAX_MOVEMENT_PX);

    const worldPoint = editor.screenToWorld(data.point);
    // Track cursor for paste-at-cursor and other drop-target-aware commands.
    editor.lastPointerWorld = worldPoint;
    // Context cursor: recompute every move (before the gesture branches
    // early-return) so it reflects hover targets AND active gestures.
    editor.refreshCursor(worldPoint);

    if (handleMoveSegmentDrag(editor, worldPoint)) return;
    if (handleMoveWaypointDrag(editor, worldPoint)) return;
    if (handleMoveLinkAnchorDrag(editor, worldPoint)) return;
    if (handleMoveTextDragSelect(editor, worldPoint)) return;
    if (handleMoveBrush(editor, worldPoint, ev.pressure)) return;

    updateContainerDropPreview(editor, worldPoint);
    if (handleMoveAnnotationDrag(editor, worldPoint)) return;

    dispatchMoveToMachine(editor, worldPoint);
  };

  const onUp = (ev: PointerEvent) => {
    if (editor.host.hasPointerCapture(ev.pointerId)) {
      editor.host.releasePointerCapture(ev.pointerId);
    }
    editor.activePointers.delete(ev.pointerId);
    // Tap or drag finished — disarm the one-finger-pan candidate.
    editor.touchPanCandidate = null;

    if (handleUpPan(editor, ev)) return;
    if (handleUpPinch(editor)) return;

    // Long-press loses its chance the moment the user releases.
    editor.cancelLongPress();

    if (handleUpSegmentDrag(editor)) return;
    if (handleUpWaypointDrag(editor)) return;
    if (handleUpLinkAnchorDrag(editor, ev)) return;
    if (handleUpTextDragSelect(editor)) return;
    if (handleUpBrush(editor)) return;
    if (handleUpAnnotationDrag(editor)) return;

    const data = fromPointerEvent(ev, editor.host);
    const worldPoint = editor.screenToWorld(data.point);

    if (handleUpLinkOpen(editor, data, worldPoint)) return;
    handleUpCommit(editor, worldPoint);
  };

  const onCancel = (ev: PointerEvent) => {
    editor.activePointers.delete(ev.pointerId);
    editor.touchPanCandidate = null;
    if (editor.panGesture?.pointerId === ev.pointerId) {
      editor.endPanGesture();
      return;
    }
    if (editor.pinch.isActive()) {
      if (editor.activePointers.size < 2) editor.pinch.end();
      return;
    }
    editor.cancelLongPress();
    // Abort a link-from-anchor drag — drop the preview/hover, create nothing.
    if (editor.linkDragFromAnchor) {
      editor.linkDragFromAnchor = null;
      editor.edgePreview = null;
      editor.hoveredLinkTarget = null;
      editor.notify();
      return;
    }
    if (editor.brushStroke) {
      editor.cancelBrushStroke();
      return;
    }
    // Annotation drag — revert to origin on cancel.
    if (editor.annotationDrag) {
      const drag = editor.annotationDrag;
      editor.annotationDrag = null;
      const ann = editor._scene.annotations.get(drag.id);
      if (ann) {
        const annotations = new Map(editor._scene.annotations);
        annotations.set(drag.id, { ...ann, position: drag.originPosition });
        editor._scene = { ...editor._scene, annotations };
        editor.notify();
      }
      return;
    }
    editor.drawingPreview = null;
    editor.actor.send({ type: "POINTER_CANCEL" });
    editor.cancelGesture();
  };

  editor.host.addEventListener("pointerdown", onDown);
  editor.host.addEventListener("pointermove", onMove);
  editor.host.addEventListener("pointerup", onUp);
  editor.host.addEventListener("pointercancel", onCancel);

  // Right-click handling: the contextmenu DOM event fires once per right mouse
  // press, AFTER pointerup on most browsers. We use `suppressNextContextMenu`
  // (set on right-click pointerdown) to preventDefault the native menu and
  // stopPropagation so window-level listeners (like `@react-ui/ContextMenu`)
  // don't re-open a menu when the user was actually panning. The "menu on click
  // without drag" path lives in `endPanGesture`.
  const onContextMenu = (ev: MouseEvent): void => {
    if (!editor.suppressNextContextMenu) return;
    editor.suppressNextContextMenu = false;
    ev.preventDefault();
    ev.stopPropagation();
  };
  // Capture phase so we beat the window-level listener that ContextMenu attaches.
  editor.host.addEventListener("contextmenu", onContextMenu, true);

  // Window-level Space tracking so Space anywhere on the page arms the next
  // mouse drag as a pan. Skip when focus is in a text input.
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.code !== "Space" && ev.key !== " ") return;
    if (isEditableTarget(ev.target)) return;
    if (editor.spaceHeld) return;
    editor.spaceHeld = true;
    // Visual affordance: "grab" cursor signals the user can drag-pan.
    editor.refreshCursor();
    // Prevent page scroll on Space — we're holding it as a modifier, not text.
    ev.preventDefault();
  };
  const onKeyUp = (ev: KeyboardEvent): void => {
    if (ev.code !== "Space" && ev.key !== " ") return;
    if (!editor.spaceHeld) return;
    editor.spaceHeld = false;
    // Recompute (→ "grabbing" if a pan is still in flight, else idle hover).
    editor.refreshCursor();
  };
  // window guard so node-env tests can still construct the editor.
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  // Wheel routing: mouse wheel → zoom, trackpad → pan / pinch. Browsers fire
  // identical `wheel` events for both devices and no per-event signal reliably
  // distinguishes them. Per-event classification:
  //   • Cmd / Ctrl + wheel (also browser-synthesized for trackpad pinch) → ZOOM.
  //   • Any deltaX ≠ 0 → trackpad 2D swipe → PAN both axes.
  //   • Plain deltaY only → ZOOM (mouse wheel; rare pure-vertical trackpad
  //     swipes also land here).
  const onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const rect = editor.host.getBoundingClientRect();
    const screenPoint = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };

    // Modifier-driven zoom (Cmd/Ctrl+wheel + trackpad pinch via ctrlKey).
    if (ev.ctrlKey || ev.metaKey) {
      applyWheelZoom(editor, ev, screenPoint);
      return;
    }
    // Trackpad 2-finger swipe with any horizontal component → pan both axes.
    // Mouse wheels never set deltaX, so this branch never misroutes mouse input.
    if (ev.deltaX !== 0) {
      applyWheelPan(editor, ev);
      return;
    }
    // Plain vertical wheel — always ZOOM.
    applyWheelZoom(editor, ev, screenPoint);
  };
  // `passive: false` because we preventDefault. Browsers default wheel listeners
  // to passive — must opt out explicitly.
  editor.host.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    editor.host.removeEventListener("pointerdown", onDown);
    editor.host.removeEventListener("pointermove", onMove);
    editor.host.removeEventListener("pointerup", onUp);
    editor.host.removeEventListener("pointercancel", onCancel);
    editor.host.removeEventListener("contextmenu", onContextMenu, true);
    editor.host.removeEventListener("wheel", onWheel);
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
  };
};
