import type { CSSProperties } from "react";
import { useSelection } from "./hooks.js";
import { PropertyPanel } from "./property-panel.js";

/**
 * Floating right-side panel that surfaces the editable properties of
 * the current selection. Auto-hides when nothing is selected so the
 * canvas stays uncluttered.
 *
 * Wraps the existing `<PropertyPanel>` content (fill / stroke
 * colour pickers, join / cap / align selectors, corner roundness)
 * inside the modern-style side-panel chrome (`du-side-panel`).
 * Hosts that need additional rows pass `extras` — rendered inside
 * the panel body after the standard PropertyPanel controls.
 */
export interface SelectedShapeActionsProps {
  /** Override panel width via inline style if 240 px doesn't suit. */
  readonly style?: CSSProperties;
  /** Extra controls rendered below the bundled PropertyPanel. */
  readonly extras?: React.ReactNode;
}

export const SelectedShapeActions = ({ style, extras }: SelectedShapeActionsProps) => {
  const selection = useSelection();
  if (selection.size === 0) return null;
  return (
    <aside className="du-side-panel du-side-panel-right" style={style}>
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
