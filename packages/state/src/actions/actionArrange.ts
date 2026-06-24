import { type Action, hasSelection } from "./types.js";

/**
 * Arrange actions — mirror (flip) the selection. Alignment and distribution
 * actions join this bundle as they land.
 */

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

export const arrangeActions: readonly Action[] = [actionFlipHorizontal, actionFlipVertical];
