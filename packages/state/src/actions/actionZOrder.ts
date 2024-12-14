import { type Action, hasSelection } from "./types.js";

export const actionBringToFront: Action = {
  id: "bring-to-front",
  label: "Bring to front",
  category: "z-order",
  hotkey: { key: "]", meta: true },
  predicate: hasSelection,
  perform: ({ editor }) => editor.bringToFront(),
};

export const actionSendToBack: Action = {
  id: "send-to-back",
  label: "Send to back",
  category: "z-order",
  hotkey: { key: "[", meta: true },
  predicate: hasSelection,
  perform: ({ editor }) => editor.sendToBack(),
};

export const zOrderActions: readonly Action[] = [actionBringToFront, actionSendToBack];
