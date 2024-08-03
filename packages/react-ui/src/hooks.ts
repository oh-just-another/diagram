import { useCallback } from "react";
import type { Scene } from "@oh-just-another/scene";
import type { Mode } from "@oh-just-another/state";
import { useDiagramContext, useEditorSelector } from "./context.js";

/**
 * The live `Editor`. Use this when you need imperative access (e.g. to call
 * `addShape`, `loadScene`, `screenToWorld`). Re-rendering on editor changes
 * is opt-in via the more specific hooks below.
 */
export const useDiagram = () => useDiagramContext();

/** Current `Scene`. Re-renders on any scene mutation. */
export const useScene = (): Scene => useEditorSelector((e) => e.scene);

/** Selected shape ids. */
export const useSelection = () => useEditorSelector((e) => e.selection);

/** Current interaction mode (`select`, `draw-rect`, `draw-ellipse`). */
export const useMode = (): Mode => useEditorSelector((e) => e.mode);

/**
 * History introspection — `canUndo`/`canRedo` flags plus the imperative
 * `undo`/`redo` callbacks. Convenient for toolbar buttons.
 */
export const useHistory = () => {
  const editor = useDiagram();
  const canUndo = useEditorSelector((e) => e.canUndo);
  const canRedo = useEditorSelector((e) => e.canRedo);

  const undo = useCallback(() => editor.undo(), [editor]);
  const redo = useCallback(() => editor.redo(), [editor]);

  return { canUndo, canRedo, undo, redo };
};
