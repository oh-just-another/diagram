import { useEffect } from "react";
import { defaultActionRegistry, type Editor } from "@oh-just-another/state";
import { openImageFilePicker } from "@oh-just-another/react-ui";
import { isEditableTarget } from "./dom-focus.js";

/**
 * Wire global keyboard shortcuts to the editor:
 *
 *   V               select mode
 *   R               draw-rectangle mode
 *   O               draw-ellipse mode (standard "Oval")
 *   L               draw-edge mode (L = link)
 *   G               toggle background grid
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
      // Editable = INPUT / TEXTAREA / SELECT / contenteditable. The bare
      // instanceof check missed contenteditable hosts, so shortcuts fired
      // while typing in them.
      const inTextField = isEditableTarget(t);
      // Text fields own their keystrokes — but Escape is special. It must
      // still cancel / deselect even when a field (e.g. the library search
      // box) has focus, otherwise opening the library panel "swallows" the
      // global Escape and the user can't clear the selection. The library
      // search handler stops propagation only while its query is non-empty
      // (first Escape clears the search); once empty the event bubbles here.
      // Blur the field first so the deselect doesn't leave a stuck caret.
      if (inTextField) {
        if (ev.key !== "Escape") return;
        (t as HTMLElement).blur();
      }

      // Everything is a registered action (built-ins + the host-registered
      // `insert-image` below + arrows/Tab/Enter). One dispatch, no inline
      // command branches.
      if (defaultActionRegistry.dispatchHotkey(ev, { editor })) {
        ev.preventDefault();
        return;
      }
    };

    // Insert image (`I`) is host-registered: it opens the OS file picker,
    // which touches the DOM the L2 kernel can't import — so it lives here
    // rather than in the core action set. `replace` is idempotent across
    // re-mounts; unregistered on cleanup.
    defaultActionRegistry.replace({
      id: "insert-image",
      label: "Insert image",
      category: "edit",
      hotkey: { key: "i" },
      perform: () => { openImageFilePicker(editor); },
    });

    window.addEventListener("keydown", onKey);

    // Clipboard paste — when the user presses Cmd+V (or Ctrl+V)
    // outside a text input AND the clipboard carries an image
    // ClipboardItem, dispatch it through editor.dispatchFileDrop.
    // Text-only clipboard paste goes through the action registry's
    // `paste` action (shape clipboard).
    const onPaste = (ev: ClipboardEvent): void => {
      const t = ev.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      const items = ev.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file) continue;
        if (!file.type.startsWith("image/")) continue;
        ev.preventDefault();
        const v = editor.scene.viewport;
        const center = {
          x: v.pan.x + v.size.width / (2 * v.zoom),
          y: v.pan.y + v.size.height / (2 * v.zoom),
        };
        void editor.dispatchFileDrop(file, center);
        return;
      }
    };
    window.addEventListener("paste", onPaste);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
      defaultActionRegistry.unregister("insert-image");
    };
  }, [editor]);
};
