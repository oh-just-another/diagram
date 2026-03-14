import { type Action, hasSelection, hasSelectionOrLink } from "./types.js";

export const actionSelectAll: Action = {
  id: "select-all",
  label: "Select all",
  category: "selection",
  hotkey: { key: "a", meta: true },
  perform: ({ editor }) => { editor.selectAll(); },
};

export const actionDeleteSelection: Action = {
  id: "delete-selection",
  label: "Delete",
  category: "selection",
  hotkey: [{ key: "Delete" }, { key: "Backspace" }],
  predicate: hasSelectionOrLink,
  perform: ({ editor }) => { editor.deleteSelected(); },
};

export const actionDuplicateSelection: Action = {
  id: "duplicate-selection",
  label: "Duplicate",
  category: "selection",
  hotkey: { key: "d", meta: true },
  predicate: hasSelection,
  perform: ({ editor }) => { editor.duplicateSelected(); },
};

export const selectionActions: readonly Action[] = [
  actionSelectAll,
  actionDeleteSelection,
  actionDuplicateSelection,
];
