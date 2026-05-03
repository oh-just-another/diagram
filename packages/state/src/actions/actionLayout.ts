import { getAutoLayoutSpec } from "@oh-just-another/scene";
import type { Action } from "./types.js";

/**
 * Layout / arrange commands surfaced in the context menu. All are pure editor
 * operations (no pointer position / DOM), unlike the annotation / comment /
 * move-to-layer menu items which stay menu-local because they need the
 * right-click world point or a DOM prompt.
 */

const arrangeGrid: Action = {
  id: "arrange-grid",
  label: "Arrange as grid",
  category: "layout",
  predicate: ({ editor }) => editor.selection.size > 1,
  perform: ({ editor }) => { editor.arrangeAsGrid(); },
};

const arrangeStackH: Action = {
  id: "arrange-stack-h",
  label: "Stack horizontally",
  category: "layout",
  predicate: ({ editor }) => editor.selection.size > 1,
  perform: ({ editor }) => { editor.arrangeAsStack({ direction: "horizontal" }); },
};

const arrangeStackV: Action = {
  id: "arrange-stack-v",
  label: "Stack vertically",
  category: "layout",
  predicate: ({ editor }) => editor.selection.size > 1,
  perform: ({ editor }) => { editor.arrangeAsStack({ direction: "vertical" }); },
};

/**
 * Rebuild a single auto-layout container's children from its spec. Only
 * applies when exactly one shape carrying an auto-layout spec is selected.
 */
const autoArrange: Action = {
  id: "auto-arrange",
  label: "Auto-arrange children",
  category: "layout",
  predicate: ({ editor }) => {
    if (editor.selection.size !== 1) return false;
    const [id] = [...editor.selection];
    if (!id) return false;
    const shape = editor.scene.elements.get(id);
    return shape ? getAutoLayoutSpec(shape) !== null : false;
  },
  perform: ({ editor }) => {
    const [id] = [...editor.selection];
    if (id) editor.runLayout(id);
  },
};

const compactZOrder: Action = {
  id: "compact-z-order",
  label: "Compact z-order",
  category: "z-order",
  perform: ({ editor }) => { editor.compactLayerZOrder(); },
};

export const layoutActions: readonly Action[] = [
  arrangeGrid,
  arrangeStackH,
  arrangeStackV,
  autoArrange,
  compactZOrder,
];
