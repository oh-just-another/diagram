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
 * `⌘`/`Ctrl` + arrows select the nearest element in that direction.
 * Distinct from plain arrows (nudge) by the modifier. Always consumes the
 * combo so the page doesn't scroll.
 */
const selectClosest: Action = {
  id: "select-closest",
  label: "Select closest in direction",
  category: "selection",
  keyTest: (ev) =>
    (ev.metaKey || ev.ctrlKey) &&
    !ev.altKey &&
    !ev.shiftKey &&
    (ev.key === "ArrowLeft" ||
      ev.key === "ArrowRight" ||
      ev.key === "ArrowUp" ||
      ev.key === "ArrowDown"),
  perform: ({ editor, event }) => {
    if (!event) return;
    switch (event.key) {
      case "ArrowLeft":
        editor.selectClosest("left");
        return;
      case "ArrowRight":
        editor.selectClosest("right");
        return;
      case "ArrowUp":
        editor.selectClosest("up");
        return;
      case "ArrowDown":
        editor.selectClosest("down");
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
  perform: ({ editor }) => { editor.focusCycle("next"); },
};

const focusPrev: Action = {
  id: "focus-prev",
  label: "Focus previous element",
  category: "selection",
  hotkey: { key: "Tab", shift: true },
  perform: ({ editor }) => { editor.focusCycle("prev"); },
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
  focusNext,
  focusPrev,
  editOrCreate,
];
