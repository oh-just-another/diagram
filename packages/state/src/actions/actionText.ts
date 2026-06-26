import { getElement, isText } from "@oh-just-another/scene";
import { type Action, type ActionContext } from "./types.js";

/** A text shape is in the current selection (font-size steps need one). */
const hasTextSelection = (ctx: ActionContext): boolean => {
  const { editor } = ctx;
  for (const id of editor.selection) {
    const el = getElement(editor.scene, id);
    if (el !== undefined && isText(el)) return true;
  }
  return false;
};

export const actionIncreaseFontSize: Action = {
  id: "increase-font-size",
  label: "Increase font size",
  category: "edit",
  // ⌘⇧> — the `>` key is `Period` shifted; match by code so it works across
  // keyboard layouts.
  hotkey: { code: "Period", meta: true, shift: true },
  predicate: hasTextSelection,
  perform: ({ editor }) => {
    editor.adjustSelectionFontSize("increase");
  },
};

export const actionDecreaseFontSize: Action = {
  id: "decrease-font-size",
  label: "Decrease font size",
  category: "edit",
  // ⌘⇧< — the `<` key is `Comma` shifted.
  hotkey: { code: "Comma", meta: true, shift: true },
  predicate: hasTextSelection,
  perform: ({ editor }) => {
    editor.adjustSelectionFontSize("decrease");
  },
};

export const textActions: readonly Action[] = [actionIncreaseFontSize, actionDecreaseFontSize];
