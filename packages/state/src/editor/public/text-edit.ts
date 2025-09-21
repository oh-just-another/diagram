import {
  getShape,
  updateShape,
  type Scene,
  type Patch,
} from "@oh-just-another/scene";
import type { LayerId, ElementId } from "@oh-just-another/types";

/**
 * Pure: precondition check for `beginTextEdit`. Returns `true`
 * when the shape exists, is a text shape, and lives on an
 * unlocked layer. Caller sets `_editingTextShape` + fires notify.
 */
export const canBeginTextEdit = (
  scene: Scene,
  id: ElementId,
  isLayerLocked: (id: LayerId) => boolean,
): boolean => {
  const shape = getShape(scene, id);
  if (shape?.type !== "text") return false;
  if (isLayerLocked(shape.layerId)) return false;
  return true;
};

/**
 * Pure: compute the patch for replacing a text shape's body.
 * Returns `null` when the shape disappeared or text didn't
 * actually change (caller still clears `_editingTextShape` +
 * notifies on null — that's a no-op commit but the UI state
 * must reset).
 */
export const computeCommitTextEdit = (
  scene: Scene,
  id: ElementId,
  next: string,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const shape = getShape(scene, id);
  if (shape?.type !== "text") return null;
  if ((shape as { text?: string }).text === next) return null;
  const r = updateShape(scene, id, (s) => ({ ...s, text: next }));
  return { scene: r.scene, patch: r.patch };
};
