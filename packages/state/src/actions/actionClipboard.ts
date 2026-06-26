import { type Action, hasSelection } from "./types.js";

export const actionCopy: Action = {
  id: "copy",
  label: "Copy",
  category: "clipboard",
  hotkey: { key: "c", meta: true },
  predicate: hasSelection,
  perform: ({ editor }) => {
    editor.copySelected();
  },
};

export const actionCut: Action = {
  id: "cut",
  label: "Cut",
  category: "clipboard",
  hotkey: { key: "x", meta: true },
  predicate: hasSelection,
  perform: ({ editor }) => {
    editor.cutSelected();
  },
};

export const actionPaste: Action = {
  id: "paste",
  label: "Paste",
  category: "clipboard",
  hotkey: { key: "v", meta: true },
  perform: ({ editor }) => {
    editor.paste();
  },
};

export const actionCopyStyle: Action = {
  id: "copy-style",
  label: "Copy style",
  category: "clipboard",
  hotkey: { key: "c", meta: true, alt: true },
  predicate: hasSelection,
  perform: ({ editor }) => {
    editor.copySelectionStyle();
  },
};

export const actionPasteStyle: Action = {
  id: "paste-style",
  label: "Paste style",
  category: "clipboard",
  hotkey: { key: "v", meta: true, alt: true },
  predicate: ({ editor }) => editor.selection.size > 0 && editor.hasStyleClipboard,
  perform: ({ editor }) => {
    editor.pasteSelectionStyle();
  },
};

export const clipboardActions: readonly Action[] = [
  actionCopy,
  actionCut,
  actionPaste,
  actionCopyStyle,
  actionPasteStyle,
];
