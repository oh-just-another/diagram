import type { Editor } from "../editor.js";

/**
 * Action architecture. Every host-facing imperative command (undo, copy,
 * switch-mode, group, …) is wrapped as an `Action` and registered in an
 * `ActionRegistry`. Hotkeys, context menu, and toolbar all dispatch through
 * the same registry, so a host extension that registers a new action gets the
 * keyboard + menu wiring for free if it provides the right metadata.
 */
export interface ActionContext {
  /** The live editor — every action operates against it. */
  readonly editor: Editor;
  /**
   * The originating event when the action was dispatched via
   * `dispatchHotkey`. Hosts can read modifier state from it; absent
   * when the action was triggered from UI (button / menu).
   */
  readonly event?: KeyboardEvent | undefined;
}

/**
 * Keyboard descriptor — matched against a `KeyboardEvent` in
 * `dispatchHotkey`. `key` is case-insensitive against `event.key`;
 * `code` uses `event.code` (layout-independent — handy for non-latin
 * keyboards). At least one of `key` / `code` must be set.
 *
 * `meta` defaults to `false` when omitted. Use the same modifier
 * idiom on macOS and Linux/Windows — `meta: true` matches Cmd on
 * macOS and Ctrl on the others. To target Ctrl specifically (e.g.
 * for the Linux-only convention) set `ctrl: true` and `meta: false`.
 */
export interface HotkeyMatcher {
  readonly key?: string;
  readonly code?: string;
  /** Cmd on macOS, Ctrl on Linux/Windows. */
  readonly meta?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
}

/**
 * Category groups Actions in the help dialog / menus.
 */
export type ActionCategory =
  | "history"
  | "selection"
  | "clipboard"
  | "z-order"
  | "grouping"
  | "zoom"
  | "mode"
  | "layout"
  | "edit"
  | "other";

export interface Action {
  /** Stable identifier — used by context menu / hotkey routing. */
  readonly id: string;
  /** Display label for menus / tooltips. */
  readonly label?: string;
  /** Category for grouping in help dialog / menus. */
  readonly category?: ActionCategory;
  /** Hotkey trigger; multiple matchers allowed (e.g. ⌘Z and Ctrl+Z). */
  readonly hotkey?: HotkeyMatcher | readonly HotkeyMatcher[];
  /**
   * Multi-key SEQUENCE trigger — the keys (plain, no modifiers) must be
   * pressed in order within `SEQUENCE_HOTKEY_WINDOW_MS` (e.g.
   * `["g", "d"]` to toggle the debug panel, vim/Gmail style). Matched
   * case-insensitively against `event.key`. Sequences are checked before
   * single-key `hotkey` / `keyTest` so the final key can't double-fire.
   */
  readonly sequence?: readonly string[];
  /**
   * Escape hatch for hotkeys the declarative `hotkey` / `sequence` can't
   * express (modifier combos with custom logic, contextual triggers).
   * Returns `true` to claim the event. Checked after `sequence` and
   * before the declarative `hotkey` matchers.
   */
  readonly keyTest?: (event: KeyboardEvent, ctx: ActionContext) => boolean;
  /**
   * `true` when the action makes sense in the current state — used
   * by menus to gate visibility AND by `dispatch` to short-circuit
   * a no-op trigger. Defaults to "always true" when omitted.
   */
  readonly predicate?: (ctx: ActionContext) => boolean;
  /**
   * Toggle state for `uiKind: "toggle"` actions (e.g. is the debug panel
   * open, is snap on). Read by the UI to render the pressed/checked state.
   * Pure read of editor / host state.
   */
  readonly checked?: (ctx: ActionContext) => boolean;
  /**
   * Serializable UI metadata so `react-ui` can render the action without
   * the kernel importing React. `iconId` keys an icon registry on the UI
   * side; `uiKind` picks the control shape.
   */
  readonly iconId?: string;
  readonly uiKind?: "button" | "toggle" | "menu-item";
  /**
   * When `true`, the action stays available in read-only / view mode.
   * Default (absent) → hidden in view mode.
   */
  readonly viewMode?: boolean;
  /** The actual work — receives the editor and (optionally) the event. */
  readonly perform: (ctx: ActionContext) => void;
}

/** Shared predicate — "element selection is non-empty". */
export const hasSelection = (ctx: ActionContext): boolean => ctx.editor.selection.size > 0;

/**
 * Predicate — "anything deletable is selected": elements OR one-or-more
 * links. Links live in a parallel selection set (`editor.selectedLinks`), so
 * a link-only (incl. multi-link) selection must still enable Delete/Backspace.
 * `deleteSelected()` removes every selected link; this just opens the gate.
 */
export const hasSelectionOrLink = (ctx: ActionContext): boolean =>
  ctx.editor.selection.size > 0 || ctx.editor.selectedLinks.size > 0;
