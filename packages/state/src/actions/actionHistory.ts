import type { Action } from "./types.js";

export const actionUndo: Action = {
  id: "undo",
  label: "Undo",
  category: "history",
  hotkey: { key: "z", meta: true },
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
  perform: ({ editor }) => editor.redo(),
};

export const historyActions: readonly Action[] = [actionUndo, actionRedo];
