import { defaultActionRegistry, type ActionRegistry } from "./actions/registry.js";
import { isEditableTarget } from "./dom-events.js";
import type { Editor } from "./editor.js";

export interface HotkeyBindingOptions {
  /**
   * Where to listen for keystrokes. Defaults to `window` (global shortcuts).
   * Pass the editor's host element to scope shortcuts to it — the right
   * choice when several editors share a page, or when the editor lives in a
   * shadow root and you want shortcuts only while it has focus.
   */
  readonly target?: Window | Document | HTMLElement;
  /** Action registry to match against. Defaults to {@link defaultActionRegistry}. */
  readonly registry?: ActionRegistry;
}

/**
 * Drive the editor's keyboard shortcuts from a `keydown` listener: each event
 * is matched against the registry's actions and the first match is dispatched.
 * Returns an unbind function.
 *
 * Typing in an `<input>` / `<textarea>` / `contenteditable` is left alone
 * (only `Escape` still passes through, blurring the field first). The
 * editable-target check reads `composedPath()[0]`, so it sees the real
 * focused node even across a shadow-root boundary where `event.target` is
 * retargeted to the host.
 */
export const bindEditorHotkeys = (
  editor: Editor,
  options: HotkeyBindingOptions = {},
): (() => void) => {
  const target: Window | Document | HTMLElement = options.target ?? window;
  const registry = options.registry ?? defaultActionRegistry;

  const onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return;
    const focused = event.composedPath()[0] ?? event.target;
    if (isEditableTarget(focused)) {
      if (event.key !== "Escape") return;
      if (focused instanceof HTMLElement) focused.blur();
    }
    if (registry.dispatchHotkey(event, { editor })) event.preventDefault();
  };

  target.addEventListener("keydown", onKeyDown);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
  };
};
