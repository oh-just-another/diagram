import { getLink, linkLabelBounds } from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";
import type { Editor } from "../editor.js";

/**
 * Whether `world` lies inside the caption pill of the SELECTED link. Shared
 * by the pointer binding (a press there starts the caption drag / double-click
 * edit) and the cursor (an I-beam over an editable caption), so both agree on
 * what counts as "over the caption".
 */
export const isOverSelectedLinkLabel = (editor: Editor, world: Vec2): boolean => {
  const linkId = editor.selectedLink;
  if (!linkId) return false;
  const edge = getLink(editor._scene, linkId);
  if (!edge?.label) return false;
  const b = linkLabelBounds(editor._scene, edge);
  return (
    b !== null &&
    world.x >= b.x &&
    world.x <= b.x + b.width &&
    world.y >= b.y &&
    world.y <= b.y + b.height
  );
};
