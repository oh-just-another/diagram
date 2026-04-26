import { isMac } from "../platform.js";
import { SEQUENCE_HOTKEY_WINDOW_MS } from "../constants.js";
import { historyActions } from "./actionHistory.js";
import { selectionActions } from "./actionSelection.js";
import { clipboardActions } from "./actionClipboard.js";
import { zOrderActions } from "./actionZOrder.js";
import { groupingActions } from "./actionGrouping.js";
import { zoomActions } from "./actionZoom.js";
import { modeActions } from "./actionMode.js";
import type { Action, ActionContext, HotkeyMatcher } from "./types.js";

/**
 * Registry of actions. Hosts construct one (or use the shared
 * `defaultActionRegistry` populated by `registerBuiltinActions`),
 * register custom actions on top, and pass it to the hotkey listener
 * + context menu builder. Order of registration is preserved so
 * `dispatchHotkey` returns the first match.
 */
export class ActionRegistry {
  private readonly entries = new Map<string, Action>();
  /** Registered keys for ordered iteration on dispatch. */
  private readonly order: string[] = [];
  /**
   * Rolling buffer of recent plain keypresses (key + event timestamp) for
   * matching multi-key `sequence` actions like `g d`. Pruned to the
   * `SEQUENCE_HOTKEY_WINDOW_MS` window on each feed; cleared on a match or
   * when a modifier combo interrupts the chain.
   */
  private seqBuffer: { key: string; t: number }[] = [];

  register(action: Action): void {
    if (this.entries.has(action.id)) {
      throw new Error(`Action already registered: ${action.id}`);
    }
    this.entries.set(action.id, action);
    this.order.push(action.id);
  }

  /** Re-registering the same id overwrites it in place. */
  replace(action: Action): void {
    if (this.entries.has(action.id)) {
      this.entries.set(action.id, action);
      return;
    }
    this.register(action);
  }

  unregister(id: string): void {
    if (!this.entries.delete(id)) return;
    const idx = this.order.indexOf(id);
    if (idx !== -1) this.order.splice(idx, 1);
  }

  get(id: string): Action | undefined {
    return this.entries.get(id);
  }

  getAll(): readonly Action[] {
    return this.order
      .map((id) => this.entries.get(id))
      .filter((a): a is Action => a !== undefined);
  }

  /**
   * Dispatch by id. Returns `true` if an action ran (predicate passed
   * AND perform was called), `false` otherwise.
   */
  dispatch(id: string, ctx: ActionContext): boolean {
    const action = this.entries.get(id);
    if (!action) return false;
    if (action.predicate && !action.predicate(ctx)) return false;
    action.perform(ctx);
    return true;
  }

  /**
   * Match the keyboard event against every registered action's
   * `hotkey` matcher(s) and dispatch the first whose predicate
   * passes. Returns `true` on hit (caller should `preventDefault`),
   * `false` when no action matched.
   *
   * Honours platform convention for `meta`: on macOS the
   * platform's Cmd key (event.metaKey) qualifies; elsewhere it's
   * Ctrl (event.ctrlKey).
   */
  dispatchHotkey(event: KeyboardEvent, ctx: Omit<ActionContext, "event">): boolean {
    const fullCtx: ActionContext = { ...ctx, event };
    // 1. Multi-key sequences (g d, …) — checked first so the final key
    //    can't also fire a single-key action bound to the same letter.
    if (this.trySequence(event, fullCtx)) return true;
    for (const id of this.order) {
      const action = this.entries.get(id);
      if (!action) continue;
      // 2. Custom keyTest escape hatch (before declarative matchers).
      if (action.keyTest?.(event, fullCtx)) {
        if (action.predicate && !action.predicate(fullCtx)) continue;
        action.perform(fullCtx);
        return true;
      }
      // 3. Declarative single-key matchers.
      if (!action.hotkey) continue;
      const matchers: readonly HotkeyMatcher[] = Array.isArray(action.hotkey)
        ? action.hotkey
        : [action.hotkey];
      for (const m of matchers) {
        if (!matchesHotkey(event, m)) continue;
        if (action.predicate && !action.predicate(fullCtx)) continue;
        action.perform(fullCtx);
        return true;
      }
    }
    return false;
  }

  /**
   * Feed the event into the sequence buffer and dispatch the first action
   * whose `sequence` the buffer's tail now completes (within the time
   * window). Only plain keypresses (single char, no Meta/Ctrl/Alt) chain;
   * any modifier combo clears the buffer so `g`-then-`Cmd+d` can't match.
   */
  private trySequence(event: KeyboardEvent, ctx: ActionContext): boolean {
    const plain =
      event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (!plain) {
      this.seqBuffer = [];
      return false;
    }
    const t = event.timeStamp;
    this.seqBuffer = this.seqBuffer.filter((e) => t - e.t <= SEQUENCE_HOTKEY_WINDOW_MS);
    this.seqBuffer.push({ key: event.key.toLowerCase(), t });
    for (const id of this.order) {
      const action = this.entries.get(id);
      if (!action?.sequence || action.sequence.length === 0) continue;
      const seq = action.sequence.map((k) => k.toLowerCase());
      const tail = this.seqBuffer.slice(-seq.length);
      if (tail.length !== seq.length) continue;
      if (!tail.every((e, i) => e.key === seq[i])) continue;
      if (action.predicate && !action.predicate(ctx)) continue;
      this.seqBuffer = [];
      action.perform(ctx);
      return true;
    }
    return false;
  }
}

const matchesHotkey = (event: KeyboardEvent, m: HotkeyMatcher): boolean => {
  if (m.key !== undefined && !matchKeyOrCode(event, m.key)) return false;
  if (m.code !== undefined && event.code !== m.code) return false;
  const want = (flag: boolean | undefined): boolean => flag === true;
  // Cross-platform meta: macOS uses metaKey, others use ctrlKey.
  const metaPressed = isMac ? event.metaKey : event.ctrlKey;
  if (want(m.meta) !== metaPressed) return false;
  if (want(m.shift) !== event.shiftKey) return false;
  if (want(m.alt) !== event.altKey) return false;
  if (m.ctrl !== undefined && want(m.ctrl) !== event.ctrlKey) return false;
  return true;
};

/**
 * Hotkey-key match that survives non-Latin keyboard layouts.
 *
 *   1. First try direct `event.key.toLowerCase()` comparison.
 *      Latin-letter layouts (US, UK, German, French, Czech, Turkish,
 *      Pinyin IME, …) provide the matcher's expected letter through
 *      `event.key` even when the underlying physical key is somewhere
 *      else, so this is the right comparison for them.
 *
 *   2. If `event.key` IS itself a Latin letter (a-z) and didn't
 *      match — bail. The user pressed a *different* Latin letter
 *      from the one the matcher wants — e.g. Czech layout swaps
 *      physical Y / Z, so pressing Y yields `key:'y'` even though
 *      `code:'KeyZ'`; we must NOT silently rewrite that to the Z
 *      hotkey.
 *
 *   3. Otherwise (`event.key` is Cyrillic, Greek, Hebrew, Arabic,
 *      a CJK glyph, etc) fall back to `event.code` — the
 *      physical-key identifier that is layout-invariant. `KeyZ` is
 *      always the key in the Latin-Z position no matter what label
 *      the OS prints on it.
 *
 * Special keys (Escape, ArrowLeft, Enter, F1, …) match through
 * step 1 because their `event.key` is stable across layouts.
 *
 * Pinyin / Cangjie / Japanese IMEs: Cmd-modified key presses
 * usually deliver the underlying Latin letter through `event.key`
 * (because the IME is bypassed), so they hit step 1. The few that
 * deliver an IME glyph instead are caught by step 3.
 */
const matchKeyOrCode = (event: KeyboardEvent, want: string): boolean => {
  if (event.key.toLowerCase() === want.toLowerCase()) return true;
  // Bail when the user pressed a *different* Latin letter — we'd
  // otherwise hijack layouts that swap physical key positions
  // (Czech Y/Z, French QWERTY-AZERTY, etc).
  if (isLatinChar(event.key)) return false;
  const expectedCode = codeForKey(want);
  return expectedCode !== null && event.code === expectedCode;
};

const isLatinChar = (s: string): boolean => /^[a-z]$/i.test(s);

/**
 * Map a host-declared `key` literal to the `event.code` we'd see
 * when the same physical key is pressed on any layout. Returns
 * `null` for keys whose `code` we don't (or shouldn't) try to
 * derive — those are matched through `event.key` only.
 */
const codeForKey = (key: string): string | null => {
  if (key.length !== 1) return null;
  const c = key.toLowerCase();
  if (c >= "a" && c <= "z") return `Key${c.toUpperCase()}`;
  if (c >= "0" && c <= "9") return `Digit${c}`;
  // Punctuation that commonly carries a host-declared hotkey
  // (Cmd+[, Cmd+], Cmd+/, Cmd+., Cmd+, Cmd+- Cmd+= Cmd+;).
  switch (c) {
    case "[":
      return "BracketLeft";
    case "]":
      return "BracketRight";
    case ",":
      return "Comma";
    case ".":
      return "Period";
    case "/":
      return "Slash";
    case ";":
      return "Semicolon";
    case "'":
      return "Quote";
    case "`":
      return "Backquote";
    case "-":
      return "Minus";
    case "=":
      return "Equal";
    case "\\":
      return "Backslash";
    default:
      return null;
  }
};

/**
 * Register the kernel's built-in actions on the given registry.
 * Pure side-effect — call once at host bootstrap (or use
 * `defaultActionRegistry` which has them pre-registered).
 *
 * Covers: undo / redo, clipboard (copy / cut / paste), selection
 * (all / clear / duplicate / delete), z-order (front / back),
 * grouping (group / ungroup), zoom (in / out / reset / fit),
 * mode switching (select / hand / draw-rect / draw-ellipse /
 * draw-edge / brush), tool-lock toggle, cancel. Anything host-
 * specific (Save / Load / Export) is registered by the host on top.
 */
export const registerBuiltinActions = (registry: ActionRegistry): void => {
  const allBuiltins: readonly Action[] = [
    ...historyActions,
    ...selectionActions,
    ...clipboardActions,
    ...zOrderActions,
    ...groupingActions,
    ...zoomActions,
    ...modeActions,
  ];
  for (const action of allBuiltins) {
    registry.register(action);
  }
};

/**
 * Shared registry with built-in actions pre-registered. Hosts can add
 * more on top via `register` or replace existing ones via `replace`.
 */
export const defaultActionRegistry = new ActionRegistry();
registerBuiltinActions(defaultActionRegistry);
