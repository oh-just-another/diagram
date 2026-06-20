import { type Action, hasSelection } from "./types.js";

export const actionBringToFront: Action = {
  id: "bring-to-front",
  label: "Bring to front",
  category: "z-order",
  // Cmd+Shift+] (Mac) / Ctrl+Shift+] (others). Without `shift`,
  // Cmd+] is bound to `bringForward`.
  hotkey: { key: "]", meta: true, shift: true },
  predicate: hasSelection,
  perform: ({ editor }) => {
    editor.bringToFront();
  },
};

export const actionSendToBack: Action = {
  id: "send-to-back",
  label: "Send to back",
  category: "z-order",
  hotkey: { key: "[", meta: true, shift: true },
  predicate: hasSelection,
  perform: ({ editor }) => {
    editor.sendToBack();
  },
};

export const actionBringForward: Action = {
  id: "bring-forward",
  label: "Bring forward",
  category: "z-order",
  hotkey: { key: "]", meta: true },
  predicate: hasSelection,
  perform: ({ editor }) => {
    editor.bringForward();
  },
};

export const actionSendBackward: Action = {
  id: "send-backward",
  label: "Send backward",
  category: "z-order",
  hotkey: { key: "[", meta: true },
  predicate: hasSelection,
  perform: ({ editor }) => {
    editor.sendBackward();
  },
};

export const zOrderActions: readonly Action[] = [
  actionBringToFront,
  actionBringForward,
  actionSendBackward,
  actionSendToBack,
];
