import { NUDGE_STEP_PX, NUDGE_STEP_SHIFT_PX } from "../constants.js";
import type { Action } from "./types.js";

/**
 * Keyboard-driven editor commands (arrows / Tab / Enter) resolved through the
 * registry so every global shortcut goes through one place. The DOM-touching
 * `insert-image` (`I`) and overlay toggles (`?` help, `g d` debug) stay
 * host-/component-registered — they need the DOM, which the L2 kernel can't
 * import.
 */

/** Arrow keys nudge the selection (Shift = coarse step). Always consumes the arrow. */
const nudgeSelection: Action = {
  id: "nudge-selection",
  label: "Nudge selection",
  category: "selection",
  keyTest: (ev) =>
    (ev.key === "ArrowLeft" ||
      ev.key === "ArrowRight" ||
      ev.key === "ArrowUp" ||
      ev.key === "ArrowDown") &&
    !ev.metaKey &&
    !ev.ctrlKey &&
    !ev.altKey,
  perform: ({ editor, event }) => {
    if (!event) return;
    const step = event.shiftKey ? NUDGE_STEP_SHIFT_PX : NUDGE_STEP_PX;
    switch (event.key) {
      case "ArrowLeft":
        editor.moveSelectionBy({ x: -step, y: 0 });
        return;
      case "ArrowRight":
        editor.moveSelectionBy({ x: step, y: 0 });
        return;
      case "ArrowUp":
        editor.moveSelectionBy({ x: 0, y: -step });
        return;
      case "ArrowDown":
        editor.moveSelectionBy({ x: 0, y: step });
        return;
    }
  },
};

/**
 * `⌥`/`Alt` + arrows navigate the selection to the adjacent node: a graph
 * neighbour (linked node) best aligned with the arrow, falling back to the
 * spatially nearest element that way. Distinct from plain arrows (nudge) by the
 * modifier. Always consumes the combo so the page doesn't scroll. The `hotkey`
 * array is display-only (help dialog chips); `keyTest` drives dispatch and
 * matches first, so it can't double-fire.
 */
const selectClosest: Action = {
  id: "select-closest",
  label: "Navigate to adjacent node",
  category: "selection",
  hotkey: [
    { key: "ArrowLeft", alt: true },
    { key: "ArrowRight", alt: true },
    { key: "ArrowUp", alt: true },
    { key: "ArrowDown", alt: true },
  ],
  keyTest: (ev) =>
    ev.altKey &&
    !ev.metaKey &&
    !ev.ctrlKey &&
    !ev.shiftKey &&
    (ev.key === "ArrowLeft" ||
      ev.key === "ArrowRight" ||
      ev.key === "ArrowUp" ||
      ev.key === "ArrowDown"),
  perform: ({ editor, event }) => {
    if (!event) return;
    switch (event.key) {
      case "ArrowLeft":
        editor.navigateFlowchart("left");
        return;
      case "ArrowRight":
        editor.navigateFlowchart("right");
        return;
      case "ArrowUp":
        editor.navigateFlowchart("up");
        return;
      case "ArrowDown":
        editor.navigateFlowchart("down");
        return;
    }
  },
};

/**
 * `⌘`/`Ctrl` + arrows grow a flowchart CREATE session from the single selected
 * node in that direction: each press adds a pending connected sibling (preview
 * only) until `Cmd/Ctrl` is released (commit) or `Escape` (cancel). Distinct
 * from plain arrows (nudge), Alt+arrows (navigate) and Cmd+Shift+arrows (align)
 * by requiring meta without alt/shift. No-op unless exactly one element is
 * selected. The `hotkey` array is display-only; `keyTest` drives dispatch and
 * matches first, so it can't double-fire.
 */
const spawnConnected: Action = {
  id: "spawn-connected",
  label: "Create connected node",
  category: "edit",
  hotkey: [
    { key: "ArrowLeft", meta: true },
    { key: "ArrowRight", meta: true },
    { key: "ArrowUp", meta: true },
    { key: "ArrowDown", meta: true },
  ],
  keyTest: (ev) =>
    (ev.metaKey || ev.ctrlKey) &&
    !ev.altKey &&
    !ev.shiftKey &&
    (ev.key === "ArrowLeft" ||
      ev.key === "ArrowRight" ||
      ev.key === "ArrowUp" ||
      ev.key === "ArrowDown"),
  predicate: ({ editor }) => editor.selection.size === 1,
  perform: ({ editor, event }) => {
    if (!event) return;
    switch (event.key) {
      case "ArrowLeft":
        editor.growFlowchart("left");
        return;
      case "ArrowRight":
        editor.growFlowchart("right");
        return;
      case "ArrowUp":
        editor.growFlowchart("up");
        return;
      case "ArrowDown":
        editor.growFlowchart("down");
        return;
    }
  },
};

/** Tab / Shift+Tab cycle keyboard focus through elements. */
const focusNext: Action = {
  id: "focus-next",
  label: "Focus next element",
  category: "selection",
  hotkey: { key: "Tab" },
  perform: ({ editor }) => {
    editor.focusCycle("next");
  },
};

const focusPrev: Action = {
  id: "focus-prev",
  label: "Focus previous element",
  category: "selection",
  hotkey: { key: "Tab", shift: true },
  perform: ({ editor }) => {
    editor.focusCycle("prev");
  },
};

/**
 * Enter: edit the single selected text shape, else (in a draw mode)
 * create a shape at the viewport centre — keyboard-only shape creation.
 * The predicate gates so Enter is only consumed when it does something
 * (otherwise it falls through to the browser / inputs).
 */
const editOrCreate: Action = {
  id: "edit-or-create",
  label: "Edit / create",
  category: "edit",
  keyTest: (ev) => ev.key === "Enter" && !ev.metaKey && !ev.ctrlKey && !ev.altKey,
  predicate: ({ editor }) => {
    if (editor.selection.size === 1) {
      const [id] = [...editor.selection];
      if (id && editor.scene.elements.get(id)?.type === "text") return true;
    }
    return editor.mode === "draw-rect" || editor.mode === "draw-ellipse";
  },
  perform: ({ editor }) => {
    if (editor.selection.size === 1) {
      const [id] = [...editor.selection];
      if (id && editor.scene.elements.get(id)?.type === "text") {
        editor.beginTextEdit(id);
        return;
      }
    }
    if (editor.mode === "draw-rect" || editor.mode === "draw-ellipse") {
      editor.createElementAtCursor();
    }
  },
};

export const keyboardActions: readonly Action[] = [
  nudgeSelection,
  selectClosest,
  spawnConnected,
  focusNext,
  focusPrev,
  editOrCreate,
];
