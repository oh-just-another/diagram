import { type Action, hasSelection } from "./types.js";

export const actionCopy: Action = {
  id: "copy",
  label: "Copy",
  category: "clipboard",
  hotkey: { key: "c", meta: true },
  predicate: hasSelection,
  perform: ({ editor }) => editor.copySelected(),
};

export const actionCut: Action = {
  id: "cut",
  label: "Cut",
  category: "clipboard",
  hotkey: { key: "x", meta: true },
  predicate: hasSelection,
  perform: ({ editor }) => editor.cutSelected(),
};

export const actionPaste: Action = {
  id: "paste",
  label: "Paste",
  category: "clipboard",
  hotkey: { key: "v", meta: true },
  perform: ({ editor }) => editor.paste(),
};

export const clipboardActions: readonly Action[] = [actionCopy, actionCut, actionPaste];
