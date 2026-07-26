import { canCarryLabel, getElement, isText, type Scene } from "@oh-just-another/scene";
import type { LayerId, ElementId } from "@oh-just-another/types";

/**
 * Precondition check for `beginTextEdit`. Returns `true` when the shape
 * exists on an unlocked layer and either IS a text shape or can carry an
 * embedded label (rect / ellipse / polygon / block-arrow) — the edit
 * session then targets the label instead of the element's own text.
 */
export const canBeginTextEdit = (
  scene: Scene,
  id: ElementId,
  isLayerLocked: (id: LayerId) => boolean,
): boolean => {
  const shape = getElement(scene, id);
  if (shape === undefined) return false;
  if (!isText(shape) && !canCarryLabel(shape)) return false;
  if (isLayerLocked(shape.layerId)) return false;
  return true;
};
