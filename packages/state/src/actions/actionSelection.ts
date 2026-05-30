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

export const actionEnterContainer: Action = {
  id: "enter-container",
  label: "Enter container",
  category: "selection",
  hotkey: { key: "ArrowDown", meta: true, shift: true },
  predicate: ({ editor }) => editor.selection.size === 1,
  perform: ({ editor }) => { editor.enterContainer(); },
};

export const actionExitContainer: Action = {
  id: "exit-container",
  label: "Exit container",
  category: "selection",
  hotkey: { key: "ArrowUp", meta: true, shift: true },
  predicate: hasSelection,
  perform: ({ editor }) => { editor.exitContainer(); },
};

export const selectionActions: readonly Action[] = [
  actionSelectAll,
  actionDeleteSelection,
  actionDuplicateSelection,
  actionEnterContainer,
  actionExitContainer,
];
