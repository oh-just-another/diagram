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

// Action architecture — command registry.
export type { Action, ActionContext, HotkeyMatcher } from "./actions.js";
export {
  ActionRegistry,
  defaultActionRegistry,
  registerBuiltinActions,
} from "./actions.js";

// Re-export annotation types so hosts that wire `addAnnotation` /
// `addComment` don't need a direct @scene dep just for the data shape.
export type { Annotation, Comment } from "@oh-just-another/scene";
