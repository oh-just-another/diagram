import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { HelpDialog } from "./help-dialog.js";
import { IconButton } from "../primitives/icon-button.js";
import { CONTROL_ICON } from "../core/constants.js";

/**
 * Help icon button. Opens the bundled `<HelpDialog>` modal and manages
 * its open state internally.
 *
 * Hosts that want a custom modal pass `renderDialog` — it receives
 * `{open, onClose}` and renders whatever they like instead of the
 * bundled `HelpDialog`.
 */
export interface HelpButtonProps {
  readonly renderDialog?: (api: { open: boolean; onClose: () => void }) => React.ReactNode;
}

export const HelpButton = ({ renderDialog }: HelpButtonProps) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label="Help"
        onClick={() => {
          setOpen(true);
        }}
      >
        <HelpCircle {...CONTROL_ICON} />
      </IconButton>
      {renderDialog ? (
        renderDialog({
          open,
          onClose: () => {
            setOpen(false);
          },
        })
      ) : (
        <HelpDialog
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
};
