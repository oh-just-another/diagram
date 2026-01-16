export type { Action, ActionCategory, ActionContext, HotkeyMatcher } from "./types.js";
export { hasSelection, hasSelectionOrLink } from "./types.js";

export { ActionRegistry, defaultActionRegistry, registerBuiltinActions } from "./registry.js";

export { actionUndo, actionRedo, historyActions } from "./actionHistory.js";
export {
  actionSelectAll,
  actionDeleteSelection,
  actionDuplicateSelection,
  selectionActions,
} from "./actionSelection.js";
export { actionCopy, actionCut, actionPaste, clipboardActions } from "./actionClipboard.js";
export { actionBringToFront, actionSendToBack, zOrderActions } from "./actionZOrder.js";
export { actionGroupSelection, actionUngroupSelection, groupingActions } from "./actionGrouping.js";
export {
  actionZoomIn,
  actionZoomOut,
  actionZoomReset,
  actionZoomToFit,
  zoomActions,
} from "./actionZoom.js";
export {
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
  modeActions,
} from "./actionMode.js";
