import { useEffect } from "react";
import { defaultActionRegistry, type Editor } from "@oh-just-another/state";

/**
 * Wire global keyboard shortcuts to the editor:
 *
 *   V               select mode
 *   R               draw-rectangle mode
 *   E               draw-ellipse mode
 *   L               draw-edge mode (L = link)
 *   Delete / ⌫      delete selected shapes / edge
 *   ⌘D              duplicate selection
 *   ⌘A              select all
 *   ⌘C / ⌘X / ⌘V    copy / cut / paste
 *   ⌘]              bring selected to front
 *   ⌘[              send selected to back
 *   ⌘Z / Ctrl-Z     undo
 *   ⌘⇧Z / ⌘Y        redo
 *   ⌘+ / ⌘=         zoom in
 *   ⌘− / ⌘_         zoom out
 *   ⌘0              reset zoom (100%, pan 0,0)
 *   ⌘1              fit content to viewport
 *   Arrow keys      nudge selection by 1 px (10 px with shift)
 *   Tab / Shift-Tab cycle selection through scene z-order
 *   Escape          clear selection / cancel gesture
 *
 * Listeners are no-ops while focus is on an `<input>` / `<textarea>` so the
 * editor doesn't steal text editing keys.
 */
export const useHotkeys = (editor: Editor | null): void => {
  useEffect(() => {
    if (!editor) return undefined;

    const onKey = (ev: KeyboardEvent): void => {
      const t = ev.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;

      // First chance: registered actions. Covers everything in the
      // built-in registry (undo/redo, clipboard, selection, z-order,
      // grouping, zoom, mode switching). Hosts that add custom
      // actions just need to register them on `defaultActionRegistry`
      // (or pass a custom one) — no edit to hotkeys.ts.
      if (defaultActionRegistry.dispatchHotkey(ev, { editor })) {
        ev.preventDefault();
        return;
      }

      // The remaining hotkeys are arrow nudging + Tab navigation +
      // Enter (open text edit / create at cursor) — gestures with
      // dynamic per-event payloads (nudge amount, shift modifier
      // direction) that don't fit the static Action shape neatly.
      // Keep them inline until the Action contract grows a "payload"
      // slot.
      const meta = ev.metaKey || ev.ctrlKey;
      if (meta || ev.altKey) return;

      const nudge = ev.shiftKey ? 10 : 1;
      switch (ev.key) {
        case "ArrowLeft":
          ev.preventDefault();
          editor.moveSelectionBy({ x: -nudge, y: 0 });
          return;
        case "ArrowRight":
          ev.preventDefault();
          editor.moveSelectionBy({ x: nudge, y: 0 });
          return;
        case "ArrowUp":
          ev.preventDefault();
          editor.moveSelectionBy({ x: 0, y: -nudge });
          return;
        case "ArrowDown":
          ev.preventDefault();
          editor.moveSelectionBy({ x: 0, y: nudge });
          return;
        case "Tab":
          ev.preventDefault();
          editor.focusCycle(ev.shiftKey ? "prev" : "next");
          return;
      }

      // Enter on single text shape selection → start inline edit.
      if (ev.key === "Enter" && editor.selection.size === 1) {
        const [id] = [...editor.selection];
        if (id) {
          const shape = editor.scene.shapes.get(id);
          if (shape?.type === "text") {
            ev.preventDefault();
            editor.beginTextEdit(id);
            return;
          }
        }
      }

      // Enter in a draw mode → keyboard-only shape creation at viewport
      // center. Lets screen-reader / keyboard-only users add shapes
      // without a drag gesture.
      if (
        ev.key === "Enter" &&
        (editor.mode === "draw-rect" || editor.mode === "draw-ellipse")
      ) {
        ev.preventDefault();
        editor.createShapeAtCursor();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);
};
