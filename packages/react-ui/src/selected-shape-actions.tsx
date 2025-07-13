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
  // `du-side-panel-auto-height` lets the panel hug its content
  // instead of stretching top-to-bottom. The library panel keeps
  // the default full-height so its long grid can scroll.
  return (
    <aside className={`du-side-panel du-side-panel-auto-height ${sideClass}`} style={style}>
      <div className="du-side-panel-body">
        <PropertyPanel />
        {extras}
      </div>
    </aside>
  );
};
