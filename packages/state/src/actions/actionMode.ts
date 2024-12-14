import type { Action } from "./types.js";

export const actionModeSelect: Action = {
  id: "mode-select",
  label: "Select tool",
  category: "mode",
  hotkey: { key: "v" },
  perform: ({ editor }) => editor.setMode("select"),
};

export const actionModeHand: Action = {
  id: "mode-hand",
  label: "Hand tool",
  category: "mode",
  hotkey: { key: "h" },
  perform: ({ editor }) => editor.setMode("hand"),
};

export const actionModeRect: Action = {
  id: "mode-rect",
  label: "Rectangle tool",
  category: "mode",
  hotkey: { key: "r" },
  perform: ({ editor }) => editor.setMode("draw-rect"),
};

export const actionModeEllipse: Action = {
  id: "mode-ellipse",
  label: "Ellipse tool",
  category: "mode",
  hotkey: { key: "e" },
  perform: ({ editor }) => editor.setMode("draw-ellipse"),
};

export const actionModeEdge: Action = {
  id: "mode-edge",
  label: "Edge tool",
  category: "mode",
  hotkey: { key: "l" },
  perform: ({ editor }) => editor.setMode("draw-edge"),
};

export const actionModeBrush: Action = {
  id: "mode-brush",
  label: "Brush tool",
  category: "mode",
  hotkey: { key: "b" },
  perform: ({ editor }) => editor.setMode("brush"),
};

export const actionToggleToolLock: Action = {
  id: "toggle-tool-lock",
  label: "Toggle tool lock",
  category: "mode",
  // No default hotkey — toolbar button only. Hosts can register one
  // via `defaultActionRegistry.replace({...actionToggleToolLock,
  // hotkey: ...})` if needed.
  perform: ({ editor }) => editor.setToolLocked(!editor.toolLocked),
};

export const actionCancel: Action = {
  id: "cancel",
  label: "Cancel / clear selection",
  category: "edit",
  hotkey: { key: "Escape" },
  perform: ({ editor }) => editor.cancelInteraction(),
};

export const modeActions: readonly Action[] = [
  actionModeSelect,
  actionModeHand,
  actionModeRect,
  actionModeEllipse,
  actionModeEdge,
  actionModeBrush,
  actionToggleToolLock,
  actionCancel,
];
