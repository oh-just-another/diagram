import type { Action } from "./types.js";

export const actionGroupSelection: Action = {
  id: "group-selection",
  label: "Group",
  category: "grouping",
  hotkey: { key: "g", meta: true },
  predicate: (ctx) => ctx.editor.selection.size >= 2,
  perform: ({ editor }) => {
    editor.groupSelected();
  },
};

export const actionUngroupSelection: Action = {
  id: "ungroup-selection",
  label: "Ungroup",
  category: "grouping",
  hotkey: { key: "g", meta: true, shift: true },
  predicate: (ctx) => {
    for (const id of ctx.editor.selection) {
      if (ctx.editor.scene.elements.get(id)?.type === "group") return true;
    }
    return false;
  },
  perform: ({ editor }) => editor.ungroup(),
};

export const groupingActions: readonly Action[] = [actionGroupSelection, actionUngroupSelection];
