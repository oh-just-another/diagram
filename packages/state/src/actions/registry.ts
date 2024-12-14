import { isMac } from "../platform.js";
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
    return this.order.map((id) => this.entries.get(id)!).filter(Boolean);
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
    for (const id of this.order) {
      const action = this.entries.get(id)!;
      if (!action.hotkey) continue;
      const matchers = Array.isArray(action.hotkey) ? action.hotkey : [action.hotkey];
      for (const m of matchers) {
        if (!matchesHotkey(event, m)) continue;
        if (action.predicate && !action.predicate(fullCtx)) continue;
        action.perform(fullCtx);
        return true;
      }
    }
    return false;
  }
}

const matchesHotkey = (event: KeyboardEvent, m: HotkeyMatcher): boolean => {
  if (m.key !== undefined && event.key.toLowerCase() !== m.key.toLowerCase()) return false;
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
