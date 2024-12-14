import type { Action } from "./types.js";

export const actionZoomIn: Action = {
  id: "zoom-in",
  label: "Zoom in",
  category: "zoom",
  hotkey: [
    { key: "=", meta: true },
    { key: "+", meta: true },
  ],
  perform: ({ editor }) => editor.zoomIn(),
};

export const actionZoomOut: Action = {
  id: "zoom-out",
  label: "Zoom out",
  category: "zoom",
  hotkey: [
    { key: "-", meta: true },
    { key: "_", meta: true },
  ],
  perform: ({ editor }) => editor.zoomOut(),
};

export const actionZoomReset: Action = {
  id: "zoom-reset",
  label: "Reset zoom",
  category: "zoom",
  hotkey: { key: "0", meta: true },
  perform: ({ editor }) => editor.resetZoom(),
};

export const actionZoomToFit: Action = {
  id: "zoom-to-fit",
  label: "Fit to screen",
  category: "zoom",
  hotkey: { key: "1", meta: true },
  perform: ({ editor }) => editor.zoomToFit(),
};

export const zoomActions: readonly Action[] = [
  actionZoomIn,
  actionZoomOut,
  actionZoomReset,
  actionZoomToFit,
];
