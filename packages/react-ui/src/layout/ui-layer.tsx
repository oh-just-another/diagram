import type { CSSProperties, ReactNode } from "react";

/**
 * Absolute-positioned overlay that sits above the canvas surface and
 * hosts every floating piece of UI (top bar, bottom bar, side panels,
 * floating toolbars). The wrapper has `pointer-events: none` so pointer
 * events fall through to the canvas everywhere the UI isn't drawn;
 * individual children re-enable events on themselves.
 *
 * UI is layered, not laid out: the canvas occupies the full surface and
 * the `<UILayer>` floats on top.
 *
 * Hosts can pass a `style` override (e.g. `{ right: 240 }`) when a docked
 * side panel takes up part of the surface, so bars stop before the docked
 * column's edge.
 */
export interface UILayerProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const UILayer = ({ children, className, style }: UILayerProps) => (
  <div className={`du-ui-layer ${className ?? ""}`.trim()} style={style}>
    {children}
  </div>
);
