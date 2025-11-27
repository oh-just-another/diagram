import {
  findContainerAt,
  getAnchorWorld,
  getDropZoneWorld,
  getElement,
  getElementWorldBounds,
  getLink,
  getLinkPath,
  updateAnnotation,
} from "@oh-just-another/scene";
import { bounds as B } from "@oh-just-another/math";
import { boundsFromPoints, interpretPressEnd, DRAG_THRESHOLD } from "../machine.js";
import { fromPointerEvent } from "../dom-events.js";
import * as Selection from "../selection.js";
import { getInteractiveHitTester } from "../interactive.js";
import { anchorOverlayPoints } from "./anchor-points.js";
import {
  ANCHOR_DOT_ACTIVE_RADIUS,
  ANCHOR_DOT_CLICK_RADIUS,
  ANCHOR_START_HIT_SLOP,
  LINK_ENDPOINT_HANDLE_RADIUS,
  LINK_START_ANCHOR_OUTSET,
  LONG_PRESS_MAX_MOVEMENT_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  WHEEL_PAN_FACTOR,
  WHEEL_ZOOM_MAX_STEP,
  WHEEL_ZOOM_SPEED,
} from "../constants.js";
import type { Bounds, ElementId, Vec2 } from "@oh-just-another/types";

/** Inclusive integer range `[a..b]`; empty when `b < a`. */
const range = (a: number, b: number): number[] => {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
};

const distanceTo = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Pointer + wheel event binding. Owns the branchy dispatch — pan /
 * pinch / brush / annotation / interactive-hit / machine flow —
 * kept in one file so reading any single handler does not require
 * jumping across module boundaries.
 *
 * Returns an unsubscribe function that removes every listener it
 * installed.
 *
 * Pragma note: `editor` is typed as `any` because this handler
 * needs the wide Editor surface (host, private fields, private
 * mutators). A narrow structural interface would be a maintenance
 * burden bigger than the type loss — the two files are
 * intentionally tightly coupled, an "internal partial" of Editor.
 * Editor.ts is the only call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const bindPointerEvents = (editor: any): (() => void) => {
  const onDown = (ev: PointerEvent) => {
    ev.preventDefault();
    editor.host.setPointerCapture(ev.pointerId);
    const data = fromPointerEvent(ev, editor.host);
    // Fresh press — forget any additive promotion from the last gesture.
    editor.additivePressAdded = null;

    // Pan gesture detection — must come BEFORE the normal flow so a
    // right-click or Space+left-click never starts a select/draw
    // gesture. Two triggers:
    //   • Right mouse button (button === 2).
    //   • Left mouse button + Space currently held.
    // Middle-click (button === 1) is covered under the same trigger.
    const isRightClick = ev.button === 2 || ev.button === 1;
    const isSpaceLeftDrag = ev.button === 0 && editor.spaceHeld;
    const isHandModeLeftDrag = ev.button === 0 && editor.mode === "hand";
    if (isRightClick || isSpaceLeftDrag || isHandModeLeftDrag) {
      // Suppress the next native contextmenu — we'll either pan
      // (if user drags) or manually fire the long-press callback
      // at pointerup (if it was a click-style right-click).
      if (isRightClick) editor.suppressNextContextMenu = true;
      editor.beginPanGesture(ev.pointerId, ev.button, data.point);
      return;
    }

    // Track every active pointer so we can detect a 2-finger pinch.
    // On the *second* concurrent pointer, cancel whatever single-pointer
    // gesture the machine started (it'd otherwise interpret the second
    // touch as a one-finger drag) and enter pinch mode.
    editor.activePointers.set(ev.pointerId, data.point);
    if (editor.activePointers.size === 2) {
      // First touch already kicked off a POINTER_DOWN — undo it so the
      // shape under finger #1 doesn't get dragged when finger #2 lands.
      editor.actor.send({ type: "POINTER_CANCEL" });
      editor.cancelGesture();
      editor.cancelLongPress();
      editor.beginPinch();
      return;
    }
    if (editor.activePointers.size > 2) {
      // 3-finger and more: stay in pinch mode but ignore additional
      // contacts — the gesture math uses the first two pointers only.
      return;
    }

    // Schedule a long-press fire — cancelled by movement or release.
    editor.startLongPress(data.point);

    const worldPoint = editor.screenToWorld(data.point);

    // Active in-canvas text edit owns the pointer. A press inside the
    // edited shape repositions the caret (and starts a drag-select);
    // a press outside commits the edit, then falls through so the same
    // click does its normal thing (select / create elsewhere).
    if (editor.editingTextElement !== null) {
      if (editor.editedElementContainsPoint(worldPoint)) {
        editor.cancelLongPress();
        editor.setTextCaretFromPoint(worldPoint);
        return;
      }
      editor.commitTextEdit();
      // fall through to normal press handling for this click
    }

    // Brush mode owns the gesture end-to-end — no machine, no
    // interactive testers, no auto-select. Start a stroke at the
    // press point with the device's pressure; onMove extends; onUp
    // commits as a single BrushElement patch.
    if (editor.mode === "brush") {
      editor.beginBrushStroke(worldPoint, ev.pressure);
      return;
    }

    // Text tool — a click places a new empty text shape (or, when it
    // lands on an existing text shape, edits that one) and opens the
    // inline editor straight away. Click-based, no rubber-band; we
    // intercept before the machine flow like brush. Cancel the
    // long-press so its context menu can't pop over the editor.
    if (editor.mode === "draw-text") {
      editor.cancelLongPress();
      const hit = editor.hitTest(worldPoint);
      const existing = hit?.kind === "element" ? getElement(editor._scene, hit.id) : null;
      if (existing?.type === "text") {
        editor._selection = Selection.single(existing.id);
        editor.beginTextEdit(existing.id);
        editor.notify();
      } else {
        editor.createTextAt(worldPoint);
      }
      return;
    }

    // Annotation pin drag — when the press lands on a pin, take over
    // the gesture entirely (skip machine, skip interactive testers).
    // Pin position updates per pointermove; commits on pointerup.
    const annHit = editor.hitAnnotation(worldPoint);
    if (annHit) {
      const ann = editor._scene.annotations.get(annHit);
      if (ann) {
        editor.annotationDrag = {
          id: annHit,
          originPosition: { ...ann.position },
          originWorldPoint: worldPoint,
          moved: false,
        };
        editor.setSelectedAnnotation(annHit);
        return;
      }
    }

    // Interactive sub-element check: when the press lands on a shape whose
    // type has a registered hit-tester (rich templates, etc.) and the
    // tester finds an interactive node, fire its emit and skip the normal
    // press flow entirely. This is what makes a click on a template Button
    // behave differently from a click on the template body.
    const topElement = editor.acceleratedElementAt(worldPoint);
    if (topElement) {
      const tester = getInteractiveHitTester(topElement.type);
      if (tester) {
        const local = {
          x: worldPoint.x - topElement.position.x,
          y: worldPoint.y - topElement.position.y,
        };
        const emit = tester(topElement, local);
        if (emit) {
          editor.applyEmit(emit);
          return;
        }
      }
    }

    // Elbow segment drag: a press on an interior segment's midpoint handle
    // moves the whole segment perpendicular. Checked before the hit-test so
    // it isn't read as deselect.
    if (editor.mode === "select" && editor._selectedLink) {
      const edge = getLink(editor._scene, editor._selectedLink);
      if (edge && (edge.routing ?? "straight") === "orthogonal") {
        const path = getLinkPath(editor._scene, edge);
        if (path && path.length >= 2) {
          const zoom = editor._scene.viewport.zoom || 1;
          const r = LINK_ENDPOINT_HANDLE_RADIUS / zoom;
          const r2 = r * r;
          // Draggable segments: the single segment of a straight elbow (grab
          // to bend it → insert), or interior segments k in 1..len-3 of a
          // routed elbow (terminal stubs touch from/to and aren't slid).
          const segs = path.length === 2 ? [0] : range(1, path.length - 3);
          for (const k of segs) {
            const a = path[k]!;
            const b = path[k + 1]!;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dx = mx - worldPoint.x;
            const dy = my - worldPoint.y;
            if (dx * dx + dy * dy <= r2) {
              const axis = Math.abs(a.y - b.y) < 1e-6 ? "h" : "v";
              const at = axis === "h" ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
              editor.beginSegmentDrag(editor._selectedLink, axis, at);
              editor.cancelLongPress();
              return;
            }
          }
        }
      }
    }

    // Bend-point (waypoint) drag on the selected link. A press on an
    // existing waypoint handle moves it; a press on a segment-midpoint
    // handle inserts a new waypoint there (on first move). Checked before
    // the normal hit-test so it isn't read as deselect / new gesture.
    if (editor.mode === "select" && editor._selectedLink) {
      const edge = getLink(editor._scene, editor._selectedLink);
      // Elbow links use segment-drag (separate mechanic), not free waypoints.
      const path = edge && (edge.routing ?? "straight") !== "orthogonal" ? getLinkPath(editor._scene, edge) : null;
      if (edge && path && path.length >= 2) {
        const zoom = editor._scene.viewport.zoom || 1;
        const r = LINK_ENDPOINT_HANDLE_RADIUS / zoom;
        const r2 = r * r;
        const waypoints: Vec2[] = [...(edge.waypoints ?? [])];
        const chain: Vec2[] = [path[0]!, ...waypoints, path[path.length - 1]!];
        const within = (p: Vec2): boolean => {
          const dx = p.x - worldPoint.x;
          const dy = p.y - worldPoint.y;
          return dx * dx + dy * dy <= r2;
        };
        // Existing waypoints take priority over the midpoint "add" handles.
        let grabbed = false;
        for (let i = 0; i < waypoints.length; i++) {
          if (within(waypoints[i]!)) {
            editor.beginWaypointDrag(editor._selectedLink, i, false);
            grabbed = true;
            break;
          }
        }
        if (!grabbed) {
          for (let i = 0; i < chain.length - 1; i++) {
            const a = chain[i]!;
            const b = chain[i + 1]!;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            if (within(mid)) {
              editor.beginWaypointDrag(editor._selectedLink, i, true);
              grabbed = true;
              break;
            }
          }
        }
        if (grabbed) {
          editor.cancelLongPress();
          return;
        }
      }
    }

    // Link-start anchor drag: a press on one of the single selected
    // element's link-start dots begins an edge FROM that anchor without
    // switching to the draw-edge tool. Checked before the normal hit-test
    // / auto-select so the press isn't read as a body drag or lasso. The
    // dots are the same world points the overlay draws (shared
    // `anchorOverlayPoints`), so they're grabbable exactly where they
    // appear. Modifier-clicks fall through to normal (additive) select.
    if (
      editor.mode === "select" &&
      !data.modifiers?.shift &&
      !data.modifiers?.meta &&
      !data.modifiers?.ctrl
    ) {
      // Begin a link FROM a start dot of either the single selected element
      // OR the element the cursor is hovering (standard hover-to-connect) — the
      // overlay shows dots for both, so both are grabbable. The dots sit
      // OUTSIDE the shape, so the hovered id comes from the move-tracked
      // `hoverLinkStartElement`, not a hit-test at the (outside) press point.
      const tryAnchorDrag = (shapeId: ElementId): boolean => {
        const shape = getElement(editor._scene, shapeId);
        if (!shape) return false;
        const zoom = editor._scene.viewport.zoom || 1;
        const { names, worldPoints } = anchorOverlayPoints(shape, LINK_START_ANCHOR_OUTSET / zoom);
        const grab = (ANCHOR_DOT_ACTIVE_RADIUS + ANCHOR_START_HIT_SLOP) / zoom;
        let bestName: string | null = null;
        let bestD2 = grab * grab;
        for (let i = 0; i < worldPoints.length; i++) {
          const p = worldPoints[i]!;
          const dx = p.x - worldPoint.x;
          const dy = p.y - worldPoint.y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD2) {
            bestD2 = d2;
            bestName = names[i]!;
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

      const selId = editor._selection.size === 1 ? [...editor._selection][0] : null;
      if (selId && tryAnchorDrag(selId)) return;
      const hovId = editor.hoverLinkStartElement as ElementId | null;
      if (hovId && hovId !== selId && tryAnchorDrag(hovId)) return;
    }

    const target = editor.hitTest(worldPoint);
    // Auto-select on press for shapes / edges that the user is about
    // to act on (drag, resize handles): you can't manipulate an
    // element that isn't selected, so pressing on an unselected one
    // promotes it to the selection BEFORE the drag starts. Shift/Cmd
    // extends instead of replacing. We don't promote inside the
    // group-handle / edge-endpoint paths because those already act on
    // the existing selection.
    // Cmd/Ctrl-click on a shape that carries a (safe) link is a
    // link-open gesture, NOT additive selection — don't mutate the
    // selection on press; `onUp` opens the URL on a tap.
    const linkModifier = Boolean(data.modifiers?.meta || data.modifiers?.ctrl);
    const isLinkOpen =
      linkModifier && target.kind === "element" && editor.elementLink(target.id) !== null;
    if (!isLinkOpen && target.kind === "element" && !editor._selection.has(target.id)) {
      const additive = Boolean(data.modifiers?.shift || data.modifiers?.meta || data.modifiers?.ctrl);
      editor._selection = additive ? Selection.add(editor._selection, target.id) : Selection.single(target.id);
      // Remember an additive promotion so a tap's up-handler doesn't
      // SELECT_TOGGLE it back off.
      if (additive) editor.additivePressAdded = target.id;
      if (editor._selectedLink !== null) editor._selectedLink = null;
      // Notify happens at the end of the gesture path; selecting now
      // ensures the live `_selection` reflects what subsequent
      // MOVE_SHAPE emits will operate on.
      editor.notify();
    }
    // Track the dragged shape id for container drop / drag-out logic
    // on pointerup. Cleared in onUp / cancel.
    editor.dragElementId = target.kind === "element" ? target.id : null;
    editor.containerHover = null;

    // Snapshot positions for the upcoming drag. Two paths populate the
    // group-move snapshot:
    //   1. Press lands on an already-selected shape → drag the whole
    //      selection (with descendants of any selected group).
    //   2. Press lands on a group shape (whether selected or not) →
    //      drag that group and its descendants. Without this, a click-
    //      drag on an unselected group would only move the wrapper
    //      (zero-bounds, invisible) and leave its children behind —
    //      looking exactly like the group had been ungrouped.
    if (target.kind === "element") {
      const pressedElement = getElement(editor._scene, target.id);
      const pressedIsGroup = pressedElement?.type === "group";
      const pressedIsFrame = pressedElement?.type === "frame";
      const inSelection = editor._selection.has(target.id);
      if (inSelection || pressedIsGroup || pressedIsFrame) {
        const ids = new Set<ElementId>();
        if (inSelection) {
          for (const id of editor.expandSelectionWithDescendants()) ids.add(id);
        }
        if (pressedIsGroup) {
          const visit = (parentId: ElementId): void => {
            if (ids.has(parentId)) return;
            ids.add(parentId);
            for (const child of editor._scene.elements.values()) {
              if (child.parentId === parentId) visit(child.id);
            }
          };
          visit(target.id);
        }
        if (pressedIsFrame) {
          // Frame drag pulls every shape with matching frameId along.
          // Frames are flat associations — no recursive descent needed.
          ids.add(target.id);
          for (const s of editor._scene.elements.values()) {
            if (s.frameId === target.id) ids.add(s.id);
          }
        }
        if (ids.size > 1) {
          const snap = new Map<ElementId, Vec2>();
          for (const id of ids) {
            const s = getElement(editor._scene, id);
            if (s) snap.set(id, s.position);
          }
          editor.groupMoveOrigin = snap;
        } else {
          editor.groupMoveOrigin = null;
        }
      } else {
        editor.groupMoveOrigin = null;
      }
    } else {
      editor.groupMoveOrigin = null;
    }
    // Snapshot each member's world bounds + position + scale when the
    // press lands on a group-handle so the per-frame resize math has
    // a stable baseline to scale against.
    //
    // For single-group selection the selection itself is just the
    // group wrapper (zero intrinsic bounds), so the snapshot would
    // be useless. Expand to include every descendant — those are
    // the leaves applyGroupResize actually scales. Same expansion
    // is harmless for plain multi-selection (no descendants).
    if (target.kind === "group-handle") {
      const shapes = new Map<ElementId, { position: Vec2; bounds: Bounds; scale: Vec2 }>();
      for (const id of editor.expandSelectionWithDescendants()) {
        const s = getElement(editor._scene, id);
        if (!s) continue;
        shapes.set(id, {
          position: s.position,
          bounds: getElementWorldBounds(s),
          scale: s.scale,
        });
      }
      editor.groupResizeOrigin = { combined: target.bounds, shapes };
    } else {
      editor.groupResizeOrigin = null;
    }
    editor.actor.send({
      type: "POINTER_DOWN",
      point: worldPoint,
      target,
      modifiers: data.modifiers,
    });
  };

  const onMove = (ev: PointerEvent) => {
    const data = fromPointerEvent(ev, editor.host);

    // Pan gesture in flight — translate cursor delta to a screen
    // pan and short-circuit. Doesn't touch the machine.
    if (editor.panGesture && editor.panGesture.pointerId === ev.pointerId) {
      const dx = data.point.x - editor.panGesture.lastPoint.x;
      const dy = data.point.y - editor.panGesture.lastPoint.y;
      editor.panGesture.lastPoint = data.point;
      // Mark as moved once total displacement crosses the slop
      // threshold — used at pointerup to decide context-menu vs
      // drag for right-click gestures.
      if (
        !editor.panGesture.moved &&
        distanceTo(editor.panGesture.startPoint, data.point) > LONG_PRESS_MAX_MOVEMENT_PX
      ) {
        editor.panGesture.moved = true;
      }
      // Natural-grab direction: cursor right → world moves right
      // (shapes follow the finger). `viewportPanBy` already
      // subtracts deltaScreen from pan, so we pass the raw cursor
      // delta — no extra inversion.
      editor.panBy({ x: dx, y: dy });
      return;
    }

    // Update tracked pointer position. In pinch mode, recompute the
    // gesture and short-circuit before sending to the machine.
    if (editor.activePointers.has(ev.pointerId)) {
      editor.activePointers.set(ev.pointerId, data.point);
    }
    if (editor.pinch.isActive()) {
      editor.applyPinch();
      return;
    }

    // Cancel long-press timer if the finger has moved beyond slop.
    editor.longPress.cancelIfMovedBeyond(data.point, LONG_PRESS_MAX_MOVEMENT_PX);

    const worldPoint = editor.screenToWorld(data.point);
    // Track cursor for paste-at-cursor and other commands that want a
    // sensible drop target.
    editor.lastPointerWorld = worldPoint;

    // Host-managed elbow segment drag of the selected link.
    if (editor.isDraggingSegment) {
      editor.updateSegmentDrag(worldPoint);
      return;
    }

    // Host-managed waypoint (bend-point) drag of the selected link.
    if (editor.isDraggingWaypoint) {
      editor.updateWaypointDrag(worldPoint);
      return;
    }

    // Link drag started from a start-anchor (select mode, no tool switch).
    // Host-managed end-to-end — the machine never saw a POINTER_DOWN for
    // it. Mirror the draw-edge tool: live link preview from the anchor +
    // snap-target highlight on the shape under the cursor. Gated on the
    // same drag threshold so a click that barely moves is not a draw.
    if (editor.linkDragFromAnchor) {
      const drag = editor.linkDragFromAnchor;
      if (!drag.moved) {
        const dx = worldPoint.x - drag.origin.x;
        const dy = worldPoint.y - drag.origin.y;
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        drag.moved = true;
      }
      editor.applyLinkPreview(drag.fromElement, drag.fromWorld, worldPoint);
      editor.updateHoveredLinkTarget(worldPoint);
      return;
    }

    // Drag-select inside the edited text shape.
    if (editor.editingTextElement !== null && editor.isTextDragging) {
      editor.extendTextSelectionToPoint(worldPoint);
      return;
    }

    // Brush stroke in progress — append a vertex and skip everything
    // else (machine, container hover, hovered-edge target).
    if (editor.brushStroke) {
      editor.extendBrushStroke(worldPoint, ev.pressure);
      return;
    }

    // Container drop preview: while dragging a single shape, find the
    // topmost container under cursor (excluding the dragged shape and
    // its descendants) and stash the drop-zone for the overlay.
    if (editor.dragElementId) {
      const dragged = editor.dragElementId;
      const exclude = new Set<ElementId>([dragged]);
      // Don't drop a container onto itself or into one of its own
      // descendants (would create a cycle).
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
            !editor.containerHover ||
            editor.containerHover.id !== next.id ||
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
    }

    // Annotation drag — update annotation position from delta. No
    // patches per-move; commit on pointerup so undo is one step.
    if (editor.annotationDrag) {
      const drag = editor.annotationDrag;
      const dx = worldPoint.x - drag.originWorldPoint.x;
      const dy = worldPoint.y - drag.originWorldPoint.y;
      if (dx !== 0 || dy !== 0) drag.moved = true;
      const ann = editor._scene.annotations.get(drag.id);
      if (ann) {
        // Mutate via apply to keep render in sync; final commit on
        // up rewrites the patch from origin to final.
        const newPos = { x: drag.originPosition.x + dx, y: drag.originPosition.y + dy };
        const next = { ...ann, position: newPos };
        const annotations = new Map(editor._scene.annotations);
        annotations.set(drag.id, next);
        editor._scene = { ...editor._scene, annotations };
        editor.notify();
      }
      return;
    }

    // Fan out to anyone listening for the local cursor — `@collab`
    // broadcasts it via awareness. Fires on every move; subscribers
    // throttle if they care.
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
    // Port-overlay tracking in draw-edge mode — both when idle (showing
    // where you can start an edge) and during the gesture (showing the
    // snap target as the pointer crosses shapes).
    if (ctx.mode === "draw-edge") {
      editor.updateHoveredLinkTarget(worldPoint);
    } else if (editor.hoveredLinkTarget !== null) {
      editor.hoveredLinkTarget = null;
      editor.notify();
    }
    // Hover-to-play: while idle (no active press) and directly over an
    // animated image, signal hover so a paused GIF can resume. (No
    // link-attach anchor reveal on idle hover — those appear only while
    // a link is actually being drawn; see the draw-edge / drag-from-
    // anchor paths.)
    if (!ctx.pressOrigin) {
      const hov = editor.hitTest(worldPoint);
      const directHs = hov?.kind === "element" ? editor._scene.elements.get(hov.id) : undefined;
      editor.hoverAnimatedElement(directHs?.type === "image" && directHs.animationKind ? directHs.id : null);
      // Hover-to-connect (standard): reveal the hovered shape's link-start dots
      // in select mode so a link can be dragged from it even unselected.
      // `worldPoint` drives the proximity-grow of the nearest dot.
      editor.setHoverLinkStart(
        editor.mode === "select" && hov?.kind === "element" ? hov.id : null,
        editor.mode === "select" ? worldPoint : null,
      );
      // Hover highlight for a link body under the cursor (when not selected).
      editor.setHoveredLink(
        editor.mode === "select" && hov?.kind === "link" && hov.id !== editor._selectedLink
          ? hov.id
          : null,
      );
    }
    editor.actor.send({ type: "POINTER_MOVE", point: worldPoint });
  };

  const onUp = (ev: PointerEvent) => {
    if (editor.host.hasPointerCapture(ev.pointerId)) {
      editor.host.releasePointerCapture(ev.pointerId);
    }
    editor.activePointers.delete(ev.pointerId);

    // Pan gesture ends — clean up cursor and state, skip the rest.
    if (editor.panGesture && editor.panGesture.pointerId === ev.pointerId) {
      editor.endPanGesture();
      return;
    }

    // Exit pinch when the second-to-last finger lifts — the surviving
    // touch (if any) does NOT resume as a single-finger drag, because
    // we already cancelled the machine on pinch entry.
    if (editor.pinch.isActive()) {
      if (editor.activePointers.size < 2) editor.pinch.end();
      return;
    }

    // Long-press loses its chance the moment the user releases.
    editor.cancelLongPress();

    // Commit a host-managed elbow segment drag (one undo step).
    if (editor.isDraggingSegment) {
      editor.endSegmentDrag();
      return;
    }

    // Commit a host-managed waypoint drag (one undo step; collapses if
    // dropped onto the line).
    if (editor.isDraggingWaypoint) {
      editor.endWaypointDrag();
      return;
    }

    // Commit a link drag that began from a start-anchor. If it moved past
    // the threshold, create the edge (landing on the shape under the
    // cursor, if any). If it did NOT move it was a plain click that merely
    // landed in the anchor grab halo — fall back to normal click semantics
    // so the gesture still selects / deselects. Either way clear the
    // preview/hover.
    //
    // A click *exactly on a dot* (narrow radius) spawns a new element + link
    // in that dot's direction; a click in the wider grab halo hit-tests as
    // empty canvas → deselect.
    if (editor.linkDragFromAnchor) {
      const drag = editor.linkDragFromAnchor;
      editor.linkDragFromAnchor = null;
      const upData = fromPointerEvent(ev, editor.host);
      const upWorld = editor.screenToWorld(upData.point);
      if (drag.moved) {
        const upHit = editor.hitTest(upWorld);
        const toElement = upHit?.kind === "element" ? upHit.id : null;
        editor.applyEmit({
          type: "CREATE_EDGE",
          fromElement: drag.fromElement,
          toElement,
          fromPoint: drag.fromWorld,
          toPoint: upWorld,
        });
      } else {
        // A click, not a draw. If it landed exactly ON the dot (narrow
        // radius), spawn a new element + link in that dot's direction.
        // Otherwise it was a click in the wider grab halo → normal
        // select / deselect by hit-test.
        const selShape = getElement(editor._scene, drag.fromElement);
        const zoom = editor._scene.viewport.zoom || 1;
        let onDot = false;
        if (selShape) {
          const { names, worldPoints } = anchorOverlayPoints(selShape, LINK_START_ANCHOR_OUTSET / zoom);
          const idx = names.indexOf(drag.anchorName);
          if (idx >= 0) {
            const dp = worldPoints[idx]!;
            const r = ANCHOR_DOT_CLICK_RADIUS / zoom;
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
          else if (upHit.kind === "link") editor.applyEmit({ type: "SELECT_EDGE_REPLACE", id: upHit.id });
        }
      }
      editor.edgePreview = null;
      editor.hoveredLinkTarget = null;
      editor.notify();
      return;
    }

    // End an in-canvas text drag-select.
    if (editor.editingTextElement !== null && editor.isTextDragging) {
      editor.endTextDragSelect();
      return;
    }

    // Commit brush stroke if one is in progress.
    if (editor.brushStroke) {
      editor.commitBrushStroke();
      return;
    }

    // Annotation drag commit — issue a single patch that goes from
    // origin position to final position so history has one undo step.
    if (editor.annotationDrag) {
      const drag = editor.annotationDrag;
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
      return;
    }

    const data = fromPointerEvent(ev, editor.host);
    const worldPoint = editor.screenToWorld(data.point);

    // Cmd/Ctrl-click on a linked element (a tap, not a drag) opens its
    // href — onDown already skipped the additive-select promote for this
    // case, so selection is untouched.
    {
      const origin = editor.actor.getSnapshot().context.pressOrigin;
      const linkMod = Boolean(data.modifiers?.meta || data.modifiers?.ctrl);
      if (origin && linkMod) {
        const zoom = editor._scene.viewport.zoom || 1;
        const movedPx = Math.hypot(worldPoint.x - origin.x, worldPoint.y - origin.y) * zoom;
        if (movedPx < LONG_PRESS_MAX_MOVEMENT_PX) {
          const hit = editor.hitTest(worldPoint);
          if (hit?.kind === "element") {
            const href = editor.elementLink(hit.id);
            if (href) {
              editor.openLink(href);
              editor.actor.send({ type: "POINTER_UP", point: worldPoint });
              editor.commitGesture();
              return;
            }
          }
        }
      }
    }

    // First, fire any click-style effect derived from the press context.
    const ctxBeforeUp = editor.actor.getSnapshot().context;
    let clickEffect = interpretPressEnd(ctxBeforeUp, worldPoint);
    // A shift/meta TAP on a shape the press already added additively must
    // NOT toggle it back off — the press handled the add, this would undo
    // it (net zero). Drop the redundant toggle. (shift-tap on a shape that
    // was already selected → additivePressAdded is null → toggle still
    // fires and removes it, as expected.)
    if (
      clickEffect?.type === "SELECT_TOGGLE" &&
      editor.additivePressAdded === clickEffect.id
    ) {
      clickEffect = null;
    }
    editor.additivePressAdded = null;

    // Group isolation routing:
    //   - Double-click on a grouped shape → enter the topmost group
    //     ancestor; select the inner shape directly (skipping the
    //     promote-to-group logic that would otherwise re-select the
    //     group root).
    //   - Inside isolation, a click that lands outside the entered
    //     group's descendants (empty space OR another shape) exits
    //     isolation and lets the normal selection happen.
    // Both branches override what `interpretPressEnd` produced.
    const handledByIsolation = editor.routeIsolationClick(clickEffect, worldPoint);
    if (!handledByIsolation && clickEffect) {
      editor.applyEmit(clickEffect);
    }

    editor.drawingPreview = null;
    // Provide the up-side hit-test when the gesture cares about where
    // it lands: drawing a new edge, or re-binding an existing edge
    // endpoint. The hit-test sees the *current* selection (edge or
    // shape) and so resolves correctly to either kind.
    const needsUpTarget =
      ctxBeforeUp.mode === "draw-edge" || ctxBeforeUp.pressTarget?.kind === "edge-endpoint";
    const upTarget = needsUpTarget ? editor.hitTest(worldPoint) : undefined;
    editor.actor.send(
      upTarget !== undefined
        ? { type: "POINTER_UP", point: worldPoint, target: upTarget }
        : { type: "POINTER_UP", point: worldPoint },
    );
    // Container reparent / drag-out — must run before commitGesture
    // so the parentId / autoGrow patches land in the same undo step.
    editor.applyContainerDrop(worldPoint);
    editor.commitGesture();

    // A tap (not a drag) on an animated image toggles its GIF playback —
    // the way to resume a heavy GIF that auto-stopped or a GIF held paused
    // under prefers-reduced-motion. Gated on near-zero displacement so it
    // never fires at the end of a drag.
    const origin = ctxBeforeUp.pressOrigin;
    if (origin) {
      const zoom = editor._scene.viewport.zoom || 1;
      const movedPx = Math.hypot(worldPoint.x - origin.x, worldPoint.y - origin.y) * zoom;
      if (movedPx < LONG_PRESS_MAX_MOVEMENT_PX) {
        const hit = editor.hitTest(worldPoint);
        if (hit?.kind === "element") {
          const s = editor._scene.elements.get(hit.id);
          if (s?.type === "image" && s.animationKind) editor.togglePlayback(s.id);
        }
      }
    }
  };

  const onCancel = (ev: PointerEvent) => {
    editor.activePointers.delete(ev.pointerId);
    if (editor.panGesture && editor.panGesture.pointerId === ev.pointerId) {
      editor.endPanGesture();
      return;
    }
    if (editor.pinch.isActive()) {
      if (editor.activePointers.size < 2) editor.pinch.end();
      return;
    }
    editor.cancelLongPress();
    // Abort a link-from-anchor drag — drop the preview/hover, create
    // nothing.
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

  // Right-click handling: the contextmenu DOM event fires once per
  // right mouse press, AFTER pointerup on most browsers. We use
  // `suppressNextContextMenu` (set on right-click pointerdown) to:
  //   • preventDefault the native browser menu;
  //   • stopPropagation so window-level listeners (like
  //     `@react-ui/ContextMenu` default) don't re-open a menu when
  //     the user was actually panning.
  // The "menu on click without drag" path lives in `endPanGesture`:
  // it fires `longPressListeners` directly, which is what
  // ContextMenu also subscribes to. So a clean right-click still
  // produces a menu — through our event channel, not the native
  // contextmenu DOM event.
  const onContextMenu = (ev: MouseEvent): void => {
    if (!editor.suppressNextContextMenu) return;
    editor.suppressNextContextMenu = false;
    ev.preventDefault();
    ev.stopPropagation();
  };
  // Capture phase so we beat the window-level listener that
  // ContextMenu attaches in its useEffect.
  editor.host.addEventListener("contextmenu", onContextMenu, true);

  // Window-level Space tracking so Space anywhere on the page
  // arms the next mouse drag as a pan. Skip when focus is in a
  // text input — Space should still type a space there.
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  };
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.code !== "Space" && ev.key !== " ") return;
    if (isEditableTarget(ev.target)) return;
    if (editor.spaceHeld) return;
    editor.spaceHeld = true;
    // Visual affordance: "grab" cursor signals the user can drag-pan.
    if (editor.previousHostCursor === null) {
      editor.previousHostCursor = editor.host.style.cursor;
      editor.host.style.cursor = "grab";
    }
    // Prevent page scroll on Space — common in browsers when no
    // input is focused. We're holding it as a modifier, not as text.
    ev.preventDefault();
  };
  const onKeyUp = (ev: KeyboardEvent): void => {
    if (ev.code !== "Space" && ev.key !== " ") return;
    if (!editor.spaceHeld) return;
    editor.spaceHeld = false;
    // Don't reset cursor if a pan gesture is still in flight — the
    // gesture's own end-handler restores it. Otherwise restore now.
    if (!editor.panGesture && editor.previousHostCursor !== null) {
      editor.host.style.cursor = editor.previousHostCursor;
      editor.previousHostCursor = null;
    }
  };
  // window guard so node-env tests can still construct the editor.
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  // Wheel routing: mouse wheel → zoom, trackpad → pan / pinch.
  // Browsers fire identical `wheel` events for both devices and no
  // per-event signal reliably distinguishes them.
  //
  // Per-event classification:
  //   • Cmd / Ctrl + wheel (also browser-synthesized for trackpad
  //     pinch) → ZOOM around cursor.
  //   • Shift + plain wheel → horizontal pan from vertical delta.
  //   • Any deltaX ≠ 0 → trackpad 2D swipe → PAN both axes.
  //   • Plain deltaY only → ZOOM (mouse wheel; rare pure-vertical
  //     trackpad swipes also land here).
  //
  // Pan direction: `panBy` subtracts deltaScreen from `viewport.pan`,
  // so we negate the wheel delta — positive deltaX (page scrolls
  // right) → camera right → content shifts LEFT, matching native
  // browser scroll feel.
  const onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const rect = editor.host.getBoundingClientRect();
    const screenPoint = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };

    const applyZoom = (): void => {
      if (ev.deltaY === 0) return;
      // Clamp the raw wheel `deltaY` to MAX_STEP so the harsh ratchet
      // of a mouse wheel turns into a calm ~10 % step per notch, while
      // trackpad pinch events — which arrive with `|deltaY|` of 2–5 —
      // bypass the clamp and stay granular for smooth multi-frame zooms.
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

    const applyPan = (): void => {
      let dx = ev.deltaX;
      let dy = ev.deltaY;
      if (ev.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      editor.panBy({ x: -dx * WHEEL_PAN_FACTOR, y: -dy * WHEEL_PAN_FACTOR });
    };

    // Modifier-driven zoom (Cmd/Ctrl+wheel + trackpad pinch via
    // browser-synthesized ctrlKey).
    if (ev.ctrlKey || ev.metaKey) {
      applyZoom();
      return;
    }

    // Trackpad 2-finger swipe with any horizontal component →
    // pan both axes. Mouse wheels never set deltaX, so this
    // branch never misroutes mouse input.
    if (ev.deltaX !== 0) {
      applyPan();
      return;
    }

    // Plain vertical wheel — always ZOOM. Pure-vertical trackpad swipes
    // also hit this; users who want vertical-only trackpad pan use
    // Space+drag or right-drag.
    applyZoom();
  };
  // `passive: false` because we preventDefault. Browsers default wheel
  // listeners to passive — must opt out explicitly.
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
