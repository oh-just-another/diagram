export type { Mode } from "./modes.js";
export { DEFAULT_MODE } from "./modes.js";

export type { Selection } from "./selection.js";
export * as selection from "./selection.js";

export type { HandleId } from "./handle.js";
export { ALL_HANDLES, HANDLE_SIZE, handlePosition, hitHandle, resizeBounds } from "./handle.js";

export type {
  InteractionContext,
  InteractionEvent,
  InteractionEmit,
  PressTarget,
  PointerDownEvent,
  PointerMoveEvent,
  PointerUpEvent,
  PointerCancelEvent,
  SetModeEvent,
} from "./machine.js";
export {
  interactionMachine,
  interpretPressEnd,
  DRAG_THRESHOLD,
  boundsFromPoints,
} from "./machine.js";

export type { OverlayStyle, PeerCursor, PeerSelection } from "./overlay.js";
export { renderOverlay, DEFAULT_OVERLAY_STYLE } from "./overlay.js";

export { PEER_CURSOR_BROADCAST_INTERVAL_MS } from "./constants.js";

export { fromPointerEvent, fromKeyboardEvent, fromWheelEvent } from "./dom-events.js";

export type { InteractiveHitTester } from "./interactive.js";
export { registerInteractiveHitTester, getInteractiveHitTester } from "./interactive.js";

export type { EditorOptions, LoadSceneOptions } from "./editor.js";
export { Editor } from "./editor.js";

// File-drop registry (host-extensible image / scene / custom).
export type { FileDropHandler, FileDropContext } from "./file-drop.js";
export {
  FileDropRegistry,
  IMAGE_MIME_TYPES,
  isImageFile,
  isSceneJsonFile,
  readFileAsDataURL,
  readFileAsText,
} from "./file-drop.js";

// Action architecture — command registry.
export type {
  Action,
  ActionCategory,
  ActionContext,
  HotkeyMatcher,
} from "./actions/index.js";
export {
  ActionRegistry,
  defaultActionRegistry,
  registerBuiltinActions,
  hasSelection,
  // Re-export individual built-ins so hosts can replace / compose.
  actionUndo,
  actionRedo,
  historyActions,
  actionSelectAll,
  actionDeleteSelection,
  actionDuplicateSelection,
  selectionActions,
  actionCopy,
  actionCut,
  actionPaste,
  clipboardActions,
  actionBringToFront,
  actionSendToBack,
  zOrderActions,
  actionGroupSelection,
  actionUngroupSelection,
  groupingActions,
  actionZoomIn,
  actionZoomOut,
  actionZoomReset,
  actionZoomToFit,
  zoomActions,
  actionModeSelect,
  actionModeHand,
  actionModeRect,
  actionModeEllipse,
  actionModeEdge,
  actionModeBrush,
  actionModeFrame,
  actionToggleToolLock,
  actionCancel,
  modeActions,
} from "./actions/index.js";

// Platform / device detection (+ hotkey pretty-printer).
export type { PrettyHotkeyDesc } from "./platform.js";
export {
  isMac,
  isWindows,
  isAndroid,
  isIOS,
  isLinux,
  isFirefox,
  isSafari,
  CTRL_OR_CMD_KEY,
  getDevicePixelRatio,
  formatHotkey,
} from "./platform.js";

// Re-export annotation types so hosts that wire `addAnnotation` /
// `addComment` don't need a direct @scene dep just for the data shape.
export type { Annotation, Comment } from "@oh-just-another/scene";
