import { type Action, type ActionContext, hasSelection } from "./types.js";

/**
 * Arrange actions — flip and align the selection. Distribution actions join
 * this bundle as they land.
 */

/** Alignment needs at least two elements to have a meaningful reference box. */
const hasMultiSelection = (ctx: ActionContext): boolean => ctx.editor.selection.size >= 2;

export const actionFlipHorizontal: Action = {
  id: "flip-horizontal",
  label: "Flip horizontal",
  category: "arrange",
  hotkey: { key: "h", shift: true },
  iconId: "flip-horizontal",
  predicate: hasSelection,
  perform: ({ editor }) => {
    editor.flipSelection("horizontal");
  },
};

export const actionFlipVertical: Action = {
  id: "flip-vertical",
  label: "Flip vertical",
  category: "arrange",
  hotkey: { key: "v", shift: true },
  iconId: "flip-vertical",
  predicate: hasSelection,
  perform: ({ editor }) => {
    editor.flipSelection("vertical");
  },
};

export const actionAlignLeft: Action = {
  id: "align-left",
  label: "Align left",
  category: "arrange",
  hotkey: { key: "ArrowLeft", alt: true },
  iconId: "align-left",
  predicate: hasMultiSelection,
  perform: ({ editor }) => {
    editor.alignSelection("left");
  },
};

export const actionAlignHCenter: Action = {
  id: "align-h-center",
  label: "Align horizontal centres",
  category: "arrange",
  iconId: "align-h-center",
  predicate: hasMultiSelection,
  perform: ({ editor }) => {
    editor.alignSelection("h-center");
  },
};

export const actionAlignRight: Action = {
  id: "align-right",
  label: "Align right",
  category: "arrange",
  hotkey: { key: "ArrowRight", alt: true },
  iconId: "align-right",
  predicate: hasMultiSelection,
  perform: ({ editor }) => {
    editor.alignSelection("right");
  },
};

export const actionAlignTop: Action = {
  id: "align-top",
  label: "Align top",
  category: "arrange",
  hotkey: { key: "ArrowUp", alt: true },
  iconId: "align-top",
  predicate: hasMultiSelection,
  perform: ({ editor }) => {
    editor.alignSelection("top");
  },
};

export const actionAlignVCenter: Action = {
  id: "align-v-center",
  label: "Align vertical centres",
  category: "arrange",
  iconId: "align-v-center",
  predicate: hasMultiSelection,
  perform: ({ editor }) => {
    editor.alignSelection("v-center");
  },
};

export const actionAlignBottom: Action = {
  id: "align-bottom",
  label: "Align bottom",
  category: "arrange",
  hotkey: { key: "ArrowDown", alt: true },
  iconId: "align-bottom",
  predicate: hasMultiSelection,
  perform: ({ editor }) => {
    editor.alignSelection("bottom");
  },
};

export const arrangeActions: readonly Action[] = [
  actionFlipHorizontal,
  actionFlipVertical,
  actionAlignLeft,
  actionAlignHCenter,
  actionAlignRight,
  actionAlignTop,
  actionAlignVCenter,
  actionAlignBottom,
];
