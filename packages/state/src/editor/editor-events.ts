import type { Scene } from "@oh-just-another/scene";
import type * as Selection from "../selection/selection.js";
import type { ActiveTool } from "../interaction/modes.js";

/**
 * Typed event surface for `Editor`. Each event has a focused payload so
 * subscribers listen only to what they care about — `useActiveTool` re-renders
 * on `tool` only, `useHistory` on `history`, etc. The umbrella `change`
 * event keeps the `editor.subscribe(fn)` contract: anything that fires a
 * specific event also fires `change` so coarse-grained listeners still
 * wake up exactly once per logical update.
 */
export interface EditorEvents {
  /**
   * Coarse-grained "something observable changed". Fired exactly
   * once per `notify()`, after all specific events. Use when you
   * subscribe to several slices and don't want a per-slice fan-out.
   */
  change: () => void;
  /** Active tool changed — type switch, lock flip or revert-target update. */
  tool: (tool: ActiveTool) => void;
  /** Selection set changed (added, removed, replaced). */
  selection: (selection: Selection.Selection) => void;
  /** Scene identity changed (any patch applied through the model). */
  scene: (scene: Scene) => void;
  /** Undo/redo availability flipped (push, undo, redo, clear). */
  history: (state: { readonly canUndo: boolean; readonly canRedo: boolean }) => void;
  /** Viewport (zoom / pan / size / gridEnabled / gridStyle) changed. */
  viewport: (scene: Scene) => void;
}
