import type { Action } from "./types.js";

export const actionUndo: Action = {
  id: "undo",
  label: "Undo",
  category: "history",
  hotkey: { key: "z", meta: true },
  iconId: "undo",
  // Gates the toolbar/menu disabled state (and short-circuits a no-op
  // dispatch) when there's nothing to undo.
  predicate: ({ editor }) => editor.canUndo,
  perform: ({ editor }) => editor.undo(),
};

export const actionRedo: Action = {
  id: "redo",
  label: "Redo",
  category: "history",
  hotkey: [
    { key: "z", meta: true, shift: true },
    { key: "y", meta: true },
  ],
  iconId: "redo",
  predicate: ({ editor }) => editor.canRedo,
  perform: ({ editor }) => editor.redo(),
};

export const historyActions: readonly Action[] = [actionUndo, actionRedo];
