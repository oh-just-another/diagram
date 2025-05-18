import type { CSSProperties } from "react";
import { useSelection } from "./hooks.js";
import { PropertyPanel } from "./property-panel.js";

/**
 * Floating side panel that surfaces the editable properties of the
 * current selection. Auto-hides when nothing is selected so the
 * canvas stays uncluttered.
 *
 * Defaults to `side="left"` because the Library panel anchors
 * `right` in the standard layout — putting Properties on the
 * opposite side avoids overlap when both are open at once.
 *
 * Wraps the existing `<PropertyPanel>` content inside the
 * modern-style side-panel chrome.
 */
export interface SelectedShapeActionsProps {
  /** Side the panel anchors to. Default `"left"`. */
  readonly side?: "left" | "right";
  readonly style?: CSSProperties;
  readonly extras?: React.ReactNode;
}

export const SelectedShapeActions = ({
  side = "left",
  style,
  extras,
}: SelectedShapeActionsProps) => {
  const selection = useSelection();
  if (selection.size === 0) return null;
  const sideClass = side === "right" ? "du-side-panel-right" : "du-side-panel-left";
  return (
    <aside className={`du-side-panel ${sideClass}`} style={style}>
      <header className="du-side-panel-header">
        <span>{selection.size === 1 ? "Properties" : `${selection.size} selected`}</span>
      </header>
      <div className="du-side-panel-body">
        <PropertyPanel
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            overflow: "visible",
          }}
        />
        {extras}
      </div>
    </aside>
  );
};
