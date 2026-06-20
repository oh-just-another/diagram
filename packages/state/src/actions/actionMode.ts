import type { Action } from "./types.js";

// `iconId` keys the react-ui icon registry; `uiKind: "toggle"` + `checked`
// (active mode) drive the pressed-state highlight when the toolbar is built
// from the registry.

export const actionModeSelect: Action = {
  id: "mode-select",
  label: "Select tool",
  category: "mode",
  hotkey: { key: "v" },
  iconId: "mode-select",
  uiKind: "toggle",
  checked: ({ editor }) => editor.mode === "select",
  perform: ({ editor }) => {
    editor.setMode("select");
  },
};

export const actionModeHand: Action = {
  id: "mode-hand",
  label: "Hand tool",
  category: "mode",
  hotkey: { key: "h" },
  iconId: "mode-hand",
  uiKind: "toggle",
  checked: ({ editor }) => editor.mode === "hand",
  perform: ({ editor }) => {
    editor.setMode("hand");
  },
};

export const actionModeRect: Action = {
  id: "mode-rect",
  label: "Rectangle tool",
  category: "mode",
  hotkey: { key: "r" },
  iconId: "mode-rect",
  uiKind: "toggle",
  checked: ({ editor }) => editor.mode === "draw-rect",
  perform: ({ editor }) => {
    editor.setMode("draw-rect");
  },
};

export const actionModeEllipse: Action = {
  id: "mode-ellipse",
  label: "Ellipse tool",
  category: "mode",
  // `O` (standard "Oval").
  hotkey: { key: "o" },
  iconId: "mode-ellipse",
  uiKind: "toggle",
  checked: ({ editor }) => editor.mode === "draw-ellipse",
  perform: ({ editor }) => {
    editor.setMode("draw-ellipse");
  },
};

export const actionModeText: Action = {
  id: "mode-text",
  label: "Text tool",
  category: "mode",
  hotkey: { key: "t" },
  iconId: "mode-text",
  uiKind: "toggle",
  checked: ({ editor }) => editor.mode === "draw-text",
  perform: ({ editor }) => {
    editor.setMode("draw-text");
  },
};

export const actionModeLink: Action = {
  id: "mode-edge",
  label: "Link tool",
  category: "mode",
  hotkey: { key: "l" },
  iconId: "mode-edge",
  uiKind: "toggle",
  checked: ({ editor }) => editor.mode === "draw-edge",
  perform: ({ editor }) => {
    editor.setMode("draw-edge");
  },
};

export const actionModeBrush: Action = {
  id: "mode-brush",
  label: "Brush tool",
  category: "mode",
  hotkey: { key: "b" },
  iconId: "mode-brush",
  uiKind: "toggle",
  checked: ({ editor }) => editor.mode === "brush",
  perform: ({ editor }) => {
    editor.setMode("brush");
  },
};

export const actionModeFrame: Action = {
  id: "mode-frame",
  label: "Frame tool",
  category: "mode",
  hotkey: { key: "f" },
  iconId: "mode-frame",
  uiKind: "toggle",
  checked: ({ editor }) => editor.mode === "draw-frame",
  perform: ({ editor }) => {
    editor.setMode("draw-frame");
  },
};

export const actionToggleToolLock: Action = {
  id: "toggle-tool-lock",
  label: "Toggle tool lock",
  category: "mode",
  iconId: "tool-lock",
  uiKind: "toggle",
  checked: ({ editor }) => editor.toolLocked,
  // No default hotkey — toolbar button only. Hosts can register one
  // via `defaultActionRegistry.replace({...actionToggleToolLock,
  // hotkey: ...})` if needed.
  perform: ({ editor }) => {
    editor.setToolLocked(!editor.toolLocked);
  },
};

export const actionCancel: Action = {
  id: "cancel",
  label: "Cancel / clear selection",
  category: "edit",
  hotkey: { key: "Escape" },
  perform: ({ editor }) => {
    editor.cancelInteraction();
  },
};

export const modeActions: readonly Action[] = [
  actionModeSelect,
  actionModeHand,
  actionModeRect,
  actionModeEllipse,
  actionModeText,
  actionModeLink,
  actionModeBrush,
  actionModeFrame,
  actionToggleToolLock,
  actionCancel,
];
