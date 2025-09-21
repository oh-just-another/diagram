import { useCallback } from "react";
import {
  DEFAULT_LAYER_ID,
  emptyScene,
  getLayersInOrder,
  type Annotation,
  type Layer,
  type Scene,
} from "@oh-just-another/scene";
import {
  type AnnotationId,
  type LinkId,
  layerId as castLayerId,
  type LayerId,
} from "@oh-just-another/types";
import { selection, type Editor, type Mode, type Selection } from "@oh-just-another/state";
import { useDiagramContext, useDiagramContextOptional, useEditorSelector } from "./context.js";

/**
 * Live `Editor` instance. Use for imperative actions (`addShape`,
 * `loadScene`, `screenToWorld`). Throws if not inside a provider.
 *
 * The reactive hooks below (`useScene`, etc.) accept the brief pre-mount
 * window and return default values; this one assumes the caller already
 * waited until the editor is ready.
 */
export const useDiagram = (): Editor => useDiagramContext();

/**
 * Same as `useDiagram` but returns `null` while the editor is being
 * created. Useful in components that render before `<DiagramSurface>`
 * mounts and want to fire callbacks lazily.
 */
export const useDiagramOptional = (): Editor | null => useDiagramContextOptional();

const EMPTY_SCENE: Scene = emptyScene();

/** Current `Scene`. Returns `emptyScene()` while the editor is being created. */
export const useScene = (): Scene => useEditorSelector((e) => e.scene, EMPTY_SCENE, "scene");

/** Selected shape ids. Returns the canonical `EMPTY` set pre-mount. */
export const useSelection = (): Selection =>
  useEditorSelector((e) => e.selection, selection.EMPTY, "selection");

/** Current interaction mode. Defaults to `"select"` pre-mount. */
export const useMode = (): Mode => useEditorSelector<Mode>((e) => e.mode, "select", "mode");

/**
 * History introspection and actions. Returns no-op callbacks (and `false`
 * flags) while the editor is being created so toolbar buttons can render
 * disabled without bespoke null-checking.
 *
 * Subscribes to the typed `history` event so undo/redo button updates
 * skip pan / zoom / selection notifies entirely.
 */
export const useHistory = (): {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
} => {
  const editor = useDiagramOptional();
  const canUndo = useEditorSelector((e) => e.canUndo, false, "history");
  const canRedo = useEditorSelector((e) => e.canRedo, false, "history");

  const undo = useCallback(() => {
    editor?.undo();
  }, [editor]);
  const redo = useCallback(() => {
    editor?.redo();
  }, [editor]);

  return { canUndo, canRedo, undo, redo };
};

const EMPTY_LAYERS: readonly Layer[] = [];

/** All layers in z-order (back → front). Returns an empty array pre-mount. */
export const useLayers = (): readonly Layer[] =>
  useEditorSelector((e) => getLayersInOrder(e.scene), EMPTY_LAYERS);

const DEFAULT_ACTIVE_LAYER: LayerId = castLayerId(DEFAULT_LAYER_ID);

/** Currently active layer id (new shapes go here). */
export const useActiveLayerId = (): LayerId =>
  useEditorSelector((e) => e.activeLayerId, DEFAULT_ACTIVE_LAYER);

const EMPTY_ANNOTATIONS: readonly Annotation[] = [];

/**
 * All annotations in scene order (insertion). Returns empty pre-mount.
 * Newest annotations come last; hosts can sort by `createdAt` for
 * chronological order.
 */
export const useAnnotations = (): readonly Annotation[] =>
  useEditorSelector((e) => [...e.scene.annotations.values()], EMPTY_ANNOTATIONS);

/** Currently focused annotation id (or null when nothing is open). */
export const useSelectedAnnotation = (): AnnotationId | null =>
  useEditorSelector<AnnotationId | null>((e) => e.selectedAnnotation, null);

/** Currently selected edge id, or null when no edge is selected. */
export const useSelectedEdge = (): LinkId | null =>
  useEditorSelector<LinkId | null>((e) => e.selectedEdge, null);
