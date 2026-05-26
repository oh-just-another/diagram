import type { Action } from "./types.js";

/**
 * View toggles (grid, …) — not part of the document, not in history.
 */

export const actionToggleGrid: Action = {
  id: "toggle-grid",
  label: "Toggle grid",
  category: "other",
  hotkey: { key: "g" },
  uiKind: "toggle",
  checked: ({ editor }) => editor.gridVisible,
  perform: ({ editor }) => { editor.toggleGrid(); },
};

export const viewActions: readonly Action[] = [actionToggleGrid];
