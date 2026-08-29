import { Redo2, Undo2 } from "lucide-react";
import { formatHotkey } from "@oh-just-another/state";
import { ButtonGroup } from "../primitives/button-group.js";
import { IconButton } from "../primitives/icon-button.js";
import { useHistory, useReadOnly } from "../core/hooks.js";
import { CONTROL_ICON } from "../core/constants.js";

const UNDO_HOTKEY = formatHotkey({ meta: true, key: "Z" });
const REDO_HOTKEY = formatHotkey({ meta: true, shift: true, key: "Z" });

/**
 * Undo / redo pill pair for the bottom bar. Each button disables when its
 * stack is empty (and in read-only mode); subscribes to the `history`
 * event only, so pan / zoom frames never re-render it.
 */
export const HistoryControls = () => {
  const { canUndo, canRedo, undo, redo } = useHistory();
  const readOnly = useReadOnly();
  return (
    <ButtonGroup ariaLabel="History">
      <IconButton label={`Undo (${UNDO_HOTKEY})`} disabled={readOnly || !canUndo} onClick={undo}>
        <Undo2 {...CONTROL_ICON} aria-hidden />
      </IconButton>
      <IconButton label={`Redo (${REDO_HOTKEY})`} disabled={readOnly || !canRedo} onClick={redo}>
        <Redo2 {...CONTROL_ICON} aria-hidden />
      </IconButton>
    </ButtonGroup>
  );
};
