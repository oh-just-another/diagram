import { getElement, isText, type Scene } from "@oh-just-another/scene";
import type { LayerId, ElementId } from "@oh-just-another/types";

/**
 * Precondition check for `beginTextEdit`. Returns `true` when the
 * shape exists, is a text shape, and lives on an unlocked layer.
 */
export const canBeginTextEdit = (
  scene: Scene,
  id: ElementId,
  isLayerLocked: (id: LayerId) => boolean,
): boolean => {
  const shape = getElement(scene, id);
  if (shape === undefined || !isText(shape)) return false;
  if (isLayerLocked(shape.layerId)) return false;
  return true;
};
