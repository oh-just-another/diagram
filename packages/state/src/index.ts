export type { ActiveTool, Mode } from "./interaction/modes.js";
export { DEFAULT_MODE } from "./interaction/modes.js";

export type { Selection } from "./selection/selection.js";
export * as selection from "./selection/selection.js";

export type { HandleId } from "./interaction/handle.js";
export {
  ALL_HANDLES,
  HANDLE_SIZE,
  handlePosition,
  hitHandle,
  resizeBounds,
  registerRotateAnchor,
  getRotateAnchor,
} from "./interaction/handle.js";

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
} from "./interaction/machine.js";
export {
  interactionMachine,
  interpretPressEnd,
  DRAG_THRESHOLD,
  boundsFromPoints,
} from "./interaction/machine.js";

export type { SnapGuide } from "./editor/applies/object-snap.js";
export type {
  EditingTextOverlay,
  SizeReadout,
  OverlayStyle,
  PeerCursor,
  PeerSelection,
} from "./render/overlay.js";
export { renderOverlay, DEFAULT_OVERLAY_STYLE } from "./render/overlay.js";

export {
  PEER_CURSOR_BROADCAST_INTERVAL_MS,
  FRAME_SIZE_PRESETS,
  STICKY_SIZE_PRESETS,
  LABEL_DEFAULT_FONT_SIZE,
  TEXT_DEFAULT_FONT_FAMILY,
  IMAGE_ASPECT_PRESETS,
  type ImageAspectPreset,
  LINK_DRAW_PRESETS,
  type DrawShapeKind,
  type LinkDrawPreset,
  DEFAULT_EDITOR_PREFERENCES,
  type EditorPreferences,
  type WheelMode,
} from "./constants.js";
export type { FrameSizePreset } from "./constants.js";

export {
  fromPointerEvent,
  fromKeyboardEvent,
  fromWheelEvent,
  isEditableTarget,
} from "./input/dom-events.js";

export { bindEditorHotkeys, type HotkeyBindingOptions } from "./input/hotkeys-binding.js";

// Scene text search — pure substring index over shape text / frame names /
// edge labels. UI-agnostic; drives the search overlay.
export {
  searchScene,
  elementSearchText,
  type SceneSearchMatch,
  type SceneSearchKind,
} from "./features/search.js";

export type { InteractiveHitTester } from "./interaction/interactive.js";
export {
  registerInteractiveHitTester,
  getInteractiveHitTester,
} from "./interaction/interactive.js";

export type { EditorOptions, LoadSceneOptions, CursorRole, CursorSpec } from "./editor.js";
export { Editor } from "./editor.js";
export type { EditorEvents } from "./editor/editor-events.js";
export type { FrameStats } from "./editor/frame-stats.js";
export { normalizeHref, safeHref } from "./editor/public/link.js";
export { DEFAULT_BRUSH_SETTINGS } from "./editor/public/brush.js";
export type { BrushSettings } from "./editor/public/brush.js";

// Tool operations (eyedropper / convert-type / image-crop / spawn-connected).
export {
  clampCrop,
  computeConvertType,
  computeSetImageCrop,
  computeCommitImageCrop,
  computeSpawnConnectedNode,
  cropFullImageLocalRect,
  cropHandleWorldPoints,
  computeCropHandleDrag,
  computeCropBodyPan,
  CROP_HANDLES,
  FULL_CROP,
  pickColorAt,
} from "./editor/public/tool-ops.js";
export type {
  ConvertTarget,
  CropDragResult,
  CropHandle,
  SpawnDirection,
} from "./editor/public/tool-ops.js";

// File-drop registry (host-extensible image / scene / custom).
export type {
  FileDropHandler,
  FileDropContext,
  FileDropKind,
  WalkOptions,
} from "./features/file-drop.js";
export {
  FileDropRegistry,
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  isImageFile,
  isVideoFile,
  isSceneJsonFile,
  readFileAsDataURL,
  readFileAsText,
  walkDataTransfer,
} from "./features/file-drop.js";

// Action architecture — command registry.
export type { Action, ActionCategory, ActionContext, HotkeyMatcher } from "./actions/index.js";
export {
  ActionRegistry,
  defaultActionRegistry,
  registerBuiltinActions,
  hasSelection,
  hasSelectionOrLink,
  // Re-export individual built-ins so hosts can replace / compose.
  actionUndo,
  actionRedo,
  historyActions,
  actionSelectAll,
  actionDeleteSelection,
  actionDuplicateSelection,
  actionToggleLock,
  actionEnterContainer,
  actionExitContainer,
  selectionActions,
  actionCopy,
  actionCut,
  actionPaste,
  actionCopyStyle,
  actionPasteStyle,
  clipboardActions,
  actionBringToFront,
  actionSendToBack,
  actionBringForward,
  actionSendBackward,
  zOrderActions,
  actionGroupSelection,
  actionUngroupSelection,
  groupingActions,
  actionZoomIn,
  actionZoomOut,
  actionZoomReset,
  actionZoomToFit,
  actionZoomToSelection,
  zoomActions,
  actionToggleGrid,
  actionToggleReadOnly,
  viewActions,
  actionFlipHorizontal,
  actionFlipVertical,
  actionAlignLeft,
  actionAlignHCenter,
  actionAlignRight,
  actionAlignTop,
  actionAlignVCenter,
  actionAlignBottom,
  actionDistributeHorizontal,
  actionDistributeVertical,
  arrangeActions,
  actionIncreaseFontSize,
  actionDecreaseFontSize,
  textActions,
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
  actionCancel,
  modeActions,
} from "./actions/index.js";

// Platform / device detection (+ hotkey pretty-printer).
export type { PrettyHotkeyDesc } from "./input/platform.js";
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
  formatHotkeyParts,
} from "./input/platform.js";

// Re-export annotation types so hosts that wire `addAnnotation` /
// `addComment` don't need a direct @scene dep just for the data shape.
export type { Annotation, Comment } from "@oh-just-another/scene";
