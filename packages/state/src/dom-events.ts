import type {
  KeyboardEventData,
  KeyPhase,
  Modifiers,
  PointerEventData,
  PointerKind,
  PointerPhase,
  WheelEventData,
} from "@oh-just-another/types";

/**
 * Translate a browser `PointerEvent` into a domain `PointerEventData`. The
 * point is expressed in the host element's local CSS-pixel coordinate space
 * (top-left of `host` = (0, 0)).
 *
 * `phase` is mapped from the event type: `pointerdown` → "down" etc.
 */
export const fromPointerEvent = (ev: PointerEvent, host: HTMLElement): PointerEventData => {
  const rect = host.getBoundingClientRect();
  return {
    kind: toPointerKind(ev.pointerType),
    phase: toPointerPhase(ev.type),
    point: { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
    buttons: ev.buttons,
    modifiers: toModifiers(ev),
    pointerId: ev.pointerId,
    timestamp: ev.timeStamp,
  };
};

export const fromKeyboardEvent = (ev: KeyboardEvent): KeyboardEventData => ({
  phase: ev.type === "keydown" ? "down" : "up",
  key: ev.key,
  code: ev.code,
  modifiers: toModifiers(ev),
  repeat: ev.repeat,
  timestamp: ev.timeStamp,
});

export const fromWheelEvent = (ev: WheelEvent, host: HTMLElement): WheelEventData => {
  const rect = host.getBoundingClientRect();
  return {
    point: { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
    deltaX: ev.deltaX,
    deltaY: ev.deltaY,
    deltaZ: ev.deltaZ,
    modifiers: toModifiers(ev),
    timestamp: ev.timeStamp,
  };
};

/**
 * True when the event is aimed at an editable element — a text field,
 * `<select>`, or any `contenteditable` host. Global keyboard / pointer
 * handlers (hotkeys, Space-pan, snap-suppress modifier tracking) must bail
 * when this is true so the user's typing isn't hijacked by canvas shortcuts.
 */
export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

const toModifiers = (ev: {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): Modifiers => ({
  shift: ev.shiftKey,
  ctrl: ev.ctrlKey,
  alt: ev.altKey,
  meta: ev.metaKey,
});

const toPointerKind = (raw: string): PointerKind => {
  if (raw === "pen") return "pen";
  if (raw === "touch") return "touch";
  return "mouse";
};

const toPointerPhase = (raw: string): PointerPhase => {
  switch (raw) {
    case "pointerdown":
      return "down";
    case "pointermove":
      return "move";
    case "pointerup":
      return "up";
    case "pointercancel":
      return "cancel";
    case "pointerenter":
      return "enter";
    case "pointerleave":
      return "leave";
    default:
      return "move";
  }
};

export type { KeyPhase };
