import { useEffect } from "react";
import type { Editor } from "@oh-just-another/state";

/**
 * Wire global keyboard shortcuts to the editor:
 *
 *   V               select mode
 *   R               draw-rectangle mode
 *   E               draw-ellipse mode
 *   L               draw-edge mode (L = link)
 *   Delete / ⌫      delete selected shapes / edge
 *   ⌘D              duplicate selection
 *   ⌘]              bring selected to front
 *   ⌘[              send selected to back
 *   ⌘Z / Ctrl-Z     undo
 *   ⌘⇧Z / ⌘Y        redo
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

      const meta = ev.metaKey || ev.ctrlKey;
      if (meta && (ev.key === "z" || ev.key === "Z")) {
        ev.preventDefault();
        if (ev.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (meta && (ev.key === "y" || ev.key === "Y")) {
        ev.preventDefault();
        editor.redo();
        return;
      }
      if (meta && (ev.key === "d" || ev.key === "D")) {
        ev.preventDefault();
        editor.duplicateSelected();
        return;
      }
      if (meta && ev.key === "]") {
        ev.preventDefault();
        editor.bringToFront();
        return;
      }
      if (meta && ev.key === "[") {
        ev.preventDefault();
        editor.sendToBack();
        return;
      }
      if (meta || ev.altKey) return;

      if (ev.key === "v" || ev.key === "V") editor.setMode("select");
      else if (ev.key === "r" || ev.key === "R") editor.setMode("draw-rect");
      else if (ev.key === "e" || ev.key === "E") editor.setMode("draw-ellipse");
      else if (ev.key === "l" || ev.key === "L") editor.setMode("draw-edge");
      else if (ev.key === "Delete" || ev.key === "Backspace") {
        editor.deleteSelected();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);
};
