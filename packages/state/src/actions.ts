import type { Editor } from "./editor.js";

/**
 * Action architecture — modern-style. Every host-facing
 * imperative command (undo, copy, switch-mode, group, …) is wrapped
 * as an `Action` and registered in an `ActionRegistry`. Hotkeys,
 * context menu, and toolbar all dispatch through the same registry,
 * so a host extension that registers a new action gets the keyboard
 * + menu wiring "for free" if it provides the right metadata.
 *
 * Reference: https://github.com/standard/standard/tree/master/packages/standard/actions
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
  /** Cmd on macOS, Ctrl on Linux/Windows (standard KEYS.CTRL_OR_CMD idiom). */
  readonly meta?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export interface Action {
  /** Stable identifier — used by context menu / hotkey routing. */
  readonly id: string;
  /** Display label for menus / tooltips. */
  readonly label?: string;
  /** Hotkey trigger; multiple matchers allowed (e.g. ⌘Z and Ctrl+Z). */
  readonly hotkey?: HotkeyMatcher | readonly HotkeyMatcher[];
  /**
   * `true` when the action makes sense in the current state — used
   * by menus to gate visibility AND by `dispatch` to short-circuit
   * a no-op trigger. Defaults to "always true" when omitted.
   */
  readonly predicate?: (ctx: ActionContext) => boolean;
  /** The actual work — receives the editor and (optionally) the event. */
  readonly perform: (ctx: ActionContext) => void;
}

/**
 * Registry of actions. Hosts construct one (or use the shared
 * `defaultActionRegistry` populated by `registerBuiltinActions`),
 * register custom actions on top, and pass it to the hotkey listener
 * + context menu builder.
 *
 * Methods are intentionally minimal — `register` / `unregister` /
 * `get` / `getAll` + the two dispatch helpers. Order of registration
 * is preserved so `dispatchHotkey` returns the first match.
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

  /** Idempotent — same payload re-register is allowed via replace. */
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

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

const matchesHotkey = (event: KeyboardEvent, m: HotkeyMatcher): boolean => {
  if (m.key !== undefined && event.key.toLowerCase() !== m.key.toLowerCase()) return false;
  if (m.code !== undefined && event.code !== m.code) return false;
  const want = (flag: boolean | undefined): boolean => flag === true;
  // Cross-platform meta: macOS uses metaKey, others use ctrlKey.
  const metaPressed = isMac ? event.metaKey : event.ctrlKey;
  if (want(m.meta) !== metaPressed) return false;
  if (want(m.shift) !== event.shiftKey) return false;
  if (want(m.alt) !== event.altKey) return false;
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
 * draw-edge / brush), tool-lock toggle. Anything host-specific
 * (Save / Load / Export) is registered by the host on top.
 */
export const registerBuiltinActions = (registry: ActionRegistry): void => {
  // Helpers.
  const hasSelection = (ctx: ActionContext): boolean => ctx.editor.selection.size > 0;

  // History.
  registry.register({
    id: "undo",
    label: "Undo",
    hotkey: { key: "z", meta: true },
    perform: ({ editor }) => editor.undo(),
  });
  registry.register({
    id: "redo",
    label: "Redo",
    hotkey: [
      { key: "z", meta: true, shift: true },
      { key: "y", meta: true },
    ],
    perform: ({ editor }) => editor.redo(),
  });

  // Selection.
  registry.register({
    id: "select-all",
    label: "Select all",
    hotkey: { key: "a", meta: true },
    perform: ({ editor }) => editor.selectAll(),
  });
  registry.register({
    id: "delete-selection",
    label: "Delete",
    hotkey: [{ key: "Delete" }, { key: "Backspace" }],
    predicate: hasSelection,
    perform: ({ editor }) => editor.deleteSelected(),
  });
  registry.register({
    id: "duplicate-selection",
    label: "Duplicate",
    hotkey: { key: "d", meta: true },
    predicate: hasSelection,
    perform: ({ editor }) => editor.duplicateSelected(),
  });

  // Clipboard.
  registry.register({
    id: "copy",
    label: "Copy",
    hotkey: { key: "c", meta: true },
    predicate: hasSelection,
    perform: ({ editor }) => editor.copySelected(),
  });
  registry.register({
    id: "cut",
    label: "Cut",
    hotkey: { key: "x", meta: true },
    predicate: hasSelection,
    perform: ({ editor }) => editor.cutSelected(),
  });
  registry.register({
    id: "paste",
    label: "Paste",
    hotkey: { key: "v", meta: true },
    perform: ({ editor }) => editor.paste(),
  });

  // Z-order.
  registry.register({
    id: "bring-to-front",
    label: "Bring to front",
    hotkey: { key: "]", meta: true },
    predicate: hasSelection,
    perform: ({ editor }) => editor.bringToFront(),
  });
  registry.register({
    id: "send-to-back",
    label: "Send to back",
    hotkey: { key: "[", meta: true },
    predicate: hasSelection,
    perform: ({ editor }) => editor.sendToBack(),
  });

  // Grouping.
  registry.register({
    id: "group-selection",
    label: "Group",
    hotkey: { key: "g", meta: true },
    predicate: (ctx) => ctx.editor.selection.size >= 2,
    perform: ({ editor }) => {
      editor.groupSelected();
    },
  });
  registry.register({
    id: "ungroup-selection",
    label: "Ungroup",
    hotkey: { key: "g", meta: true, shift: true },
    predicate: (ctx) => {
      for (const id of ctx.editor.selection) {
        if (ctx.editor.scene.shapes.get(id)?.type === "group") return true;
      }
      return false;
    },
    perform: ({ editor }) => editor.ungroup(),
  });

  // Zoom.
  registry.register({
    id: "zoom-in",
    label: "Zoom in",
    hotkey: [
      { key: "=", meta: true },
      { key: "+", meta: true },
    ],
    perform: ({ editor }) => editor.zoomIn(),
  });
  registry.register({
    id: "zoom-out",
    label: "Zoom out",
    hotkey: [
      { key: "-", meta: true },
      { key: "_", meta: true },
    ],
    perform: ({ editor }) => editor.zoomOut(),
  });
  registry.register({
    id: "zoom-reset",
    label: "Reset zoom",
    hotkey: { key: "0", meta: true },
    perform: ({ editor }) => editor.resetZoom(),
  });
  registry.register({
    id: "zoom-to-fit",
    label: "Fit to screen",
    hotkey: { key: "1", meta: true },
    perform: ({ editor }) => editor.zoomToFit(),
  });

  // Mode switching.
  registry.register({
    id: "mode-select",
    label: "Select tool",
    hotkey: { key: "v" },
    perform: ({ editor }) => editor.setMode("select"),
  });
  registry.register({
    id: "mode-hand",
    label: "Hand tool",
    hotkey: { key: "h" },
    perform: ({ editor }) => editor.setMode("hand"),
  });
  registry.register({
    id: "mode-rect",
    label: "Rectangle tool",
    hotkey: { key: "r" },
    perform: ({ editor }) => editor.setMode("draw-rect"),
  });
  registry.register({
    id: "mode-ellipse",
    label: "Ellipse tool",
    hotkey: { key: "e" },
    perform: ({ editor }) => editor.setMode("draw-ellipse"),
  });
  registry.register({
    id: "mode-edge",
    label: "Edge tool",
    hotkey: { key: "l" },
    perform: ({ editor }) => editor.setMode("draw-edge"),
  });
  registry.register({
    id: "mode-brush",
    label: "Brush tool",
    hotkey: { key: "b" },
    perform: ({ editor }) => editor.setMode("brush"),
  });

  // Tool lock toggle (no hotkey by default — toolbar button only).
  registry.register({
    id: "toggle-tool-lock",
    label: "Toggle tool lock",
    perform: ({ editor }) => editor.setToolLocked(!editor.toolLocked),
  });

  // Cancel — Escape clears selection / exits isolation / cancels gesture.
  registry.register({
    id: "cancel",
    label: "Cancel",
    hotkey: { key: "Escape" },
    perform: ({ editor }) => editor.cancelInteraction(),
  });
};

/**
 * Shared registry with built-in actions pre-registered. Hosts can add
 * more on top via `register` or replace existing ones via `replace`.
 */
export const defaultActionRegistry = new ActionRegistry();
registerBuiltinActions(defaultActionRegistry);
