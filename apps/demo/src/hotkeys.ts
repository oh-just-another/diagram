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
      if (meta && (ev.key === "a" || ev.key === "A")) {
        ev.preventDefault();
        editor.selectAll();
        return;
      }
      if (meta && (ev.key === "c" || ev.key === "C")) {
        ev.preventDefault();
        editor.copySelected();
        return;
      }
      if (meta && (ev.key === "x" || ev.key === "X")) {
        ev.preventDefault();
        editor.cutSelected();
        return;
      }
      if (meta && (ev.key === "v" || ev.key === "V")) {
        ev.preventDefault();
        editor.paste();
        return;
      }
      if (meta && (ev.key === "g" || ev.key === "G")) {
        ev.preventDefault();
        if (ev.shiftKey) editor.ungroup();
        else editor.groupSelected();
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
      // Zoom: ⌘+ / ⌘= zoom in, ⌘− / ⌘_ zoom out, ⌘0 reset, ⌘1 fit.
      // Note: `+` arrives as `=` without shift; `-` arrives as `-` itself.
      if (meta && (ev.key === "=" || ev.key === "+")) {
        ev.preventDefault();
        editor.zoomIn();
        return;
      }
      if (meta && (ev.key === "-" || ev.key === "_")) {
        ev.preventDefault();
        editor.zoomOut();
        return;
      }
      if (meta && ev.key === "0") {
        ev.preventDefault();
        editor.resetZoom();
        return;
      }
      if (meta && ev.key === "1") {
        ev.preventDefault();
        editor.zoomToFit();
        return;
      }
      if (meta || ev.altKey) return;

      // Keyboard navigation — arrows / tab / escape.
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
        case "Escape":
          editor.cancelInteraction();
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

      if (ev.key === "v" || ev.key === "V") editor.setMode("select");
      else if (ev.key === "h" || ev.key === "H") editor.setMode("hand");
      else if (ev.key === "r" || ev.key === "R") editor.setMode("draw-rect");
      else if (ev.key === "e" || ev.key === "E") editor.setMode("draw-ellipse");
      else if (ev.key === "l" || ev.key === "L") editor.setMode("draw-edge");
      else if (ev.key === "b" || ev.key === "B") editor.setMode("brush");
      else if (ev.key === "Delete" || ev.key === "Backspace") {
        editor.deleteSelected();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);
};
