import type { Action } from "./types.js";

/**
 * View toggles (grid, …) — not part of the document, not in history.
 */

export const actionToggleGrid: Action = {
  id: "toggle-grid",
  label: "Toggle grid",
  category: "other",
  viewMode: true,
  hotkey: { key: "g" },
  uiKind: "toggle",
  checked: ({ editor }) => editor.gridEnabled,
  perform: ({ editor }) => {
    editor.toggleGrid();
  },
};

/**
 * Read-only / view mode toggle (`⌥R`). Flagged `viewMode` so it stays
 * live once the editor is read-only — otherwise you could enter view
 * mode but never leave it via the keyboard.
 */
export const actionToggleReadOnly: Action = {
  id: "toggle-read-only",
  label: "Read-only mode",
  category: "other",
  viewMode: true,
  hotkey: { key: "r", alt: true },
  uiKind: "toggle",
  checked: ({ editor }) => editor.readOnly,
  perform: ({ editor }) => {
    editor.toggleReadOnly();
  },
};

export const viewActions: readonly Action[] = [actionToggleGrid, actionToggleReadOnly];
