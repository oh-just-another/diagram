/**
 * True when the keyboard event is aimed at an editable element — a text
 * field, `<select>`, or any `contenteditable` host. Global keyboard handlers
 * (hotkeys, snap-suppress modifier tracking) must bail when this is true so
 * the user's typing isn't hijacked by canvas shortcuts.
 *
 * Canonical implementation lives in `@oh-just-another/state` — re-exported here
 * so editor's public API keeps surfacing it.
 */
export { isEditableTarget } from "@oh-just-another/state";
