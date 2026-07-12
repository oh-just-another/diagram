import type { Action } from "./types.js";

// `iconId` keys the react-ui icon registry; `uiKind: "toggle"` + `checked`
// (active mode) drive the pressed-state highlight when the toolbar is built
// from the registry.

export const actionModeSelect: Action = {
  id: "mode-select",
  label: "Select tool",
  category: "tool",
  viewMode: true,
  hotkey: { key: "v" },
  iconId: "mode-select",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "select",
  perform: ({ editor }) => {
    editor.setActiveTool("select");
  },
};

export const actionModeHand: Action = {
  id: "mode-hand",
  label: "Hand tool",
  category: "tool",
  viewMode: true,
  hotkey: { key: "h" },
  iconId: "mode-hand",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "hand",
  perform: ({ editor }) => {
    editor.setActiveTool("hand");
  },
};

export const actionModeRect: Action = {
  id: "mode-rect",
  label: "Rectangle tool",
  category: "tool",
  hotkey: { key: "r" },
  iconId: "mode-rect",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "draw-rect",
  perform: ({ editor }) => {
    editor.setActiveTool("draw-rect");
  },
};

export const actionModeEllipse: Action = {
  id: "mode-ellipse",
  label: "Ellipse tool",
  category: "tool",
  // `O` (standard "Oval").
  hotkey: { key: "o" },
  iconId: "mode-ellipse",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "draw-ellipse",
  perform: ({ editor }) => {
    editor.setActiveTool("draw-ellipse");
  },
};

export const actionModeText: Action = {
  id: "mode-text",
  label: "Text tool",
  category: "tool",
  hotkey: { key: "t" },
  iconId: "mode-text",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "draw-text",
  perform: ({ editor }) => {
    editor.setActiveTool("draw-text");
  },
};

export const actionModeLink: Action = {
  id: "mode-edge",
  label: "Link tool",
  category: "tool",
  hotkey: { key: "l" },
  iconId: "mode-edge",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "draw-edge",
  perform: ({ editor }) => {
    editor.setActiveTool("draw-edge");
  },
};

export const actionModeBrush: Action = {
  id: "mode-brush",
  label: "Brush tool",
  category: "tool",
  hotkey: { key: "b" },
  iconId: "mode-brush",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "brush",
  perform: ({ editor }) => {
    editor.setActiveTool("brush");
  },
};

export const actionModeErase: Action = {
  id: "mode-erase",
  label: "Eraser tool",
  category: "tool",
  hotkey: { key: "e" },
  iconId: "mode-erase",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "erase",
  perform: ({ editor }) => {
    editor.setActiveTool("erase");
  },
};

export const actionModeLaser: Action = {
  id: "mode-laser",
  label: "Laser pointer",
  category: "tool",
  // Laser is presentation-only (no scene mutation) → available in read-only.
  viewMode: true,
  hotkey: { key: "k" },
  iconId: "mode-laser",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "laser",
  perform: ({ editor }) => {
    editor.setActiveTool("laser");
  },
};

export const actionModeFrame: Action = {
  id: "mode-frame",
  label: "Frame tool",
  category: "tool",
  hotkey: { key: "f" },
  iconId: "mode-frame",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.type === "draw-frame",
  perform: ({ editor }) => {
    editor.setActiveTool("draw-frame");
  },
};

export const actionToggleToolLock: Action = {
  id: "toggle-tool-lock",
  label: "Toggle tool lock",
  category: "tool",
  iconId: "tool-lock",
  uiKind: "toggle",
  checked: ({ editor }) => editor.activeTool.locked,
  // No default hotkey — toolbar button only. Hosts can register one
  // via `defaultActionRegistry.replace({...actionToggleToolLock,
  // hotkey: ...})` if needed.
  perform: ({ editor }) => {
    editor.setToolLocked(!editor.activeTool.locked);
  },
};

const actionCommitCrop: Action = {
  id: "commit-image-crop",
  label: "Apply crop",
  category: "edit",
  hotkey: { key: "Enter" },
  predicate: ({ editor }) => editor.activeTool.type === "crop",
  perform: ({ editor }) => {
    editor.commitImageCrop();
  },
};

const actionCancelCrop: Action = {
  id: "cancel-image-crop",
  label: "Cancel crop",
  category: "edit",
  viewMode: true,
  hotkey: { key: "Escape" },
  predicate: ({ editor }) => editor.activeTool.type === "crop",
  perform: ({ editor }) => {
    editor.cancelImageCrop();
  },
};

export const actionCancel: Action = {
  id: "cancel",
  label: "Cancel / clear selection",
  category: "edit",
  viewMode: true,
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
  actionModeErase,
  actionModeLaser,
  actionModeFrame,
  actionToggleToolLock,
  actionCommitCrop,
  actionCancelCrop,
  actionCancel,
];
