/**
 * True when the keyboard event is aimed at an editable element — a text
 * field, `<select>`, or any `contenteditable` host. Global keyboard
 * handlers (hotkeys, snap-suppress modifier tracking) must bail when this
 * is true so the user's typing isn't hijacked by canvas shortcuts.
 */
export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};
