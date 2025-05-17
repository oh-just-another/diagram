import type { ReactNode } from "react";

/**
 * Absolute-positioned overlay that sits above the canvas surface and
 * hosts every floating piece of UI (top bar, bottom bar, side panels,
 * floating toolbars). The wrapper has `pointer-events: none` so pointer
 * events fall through to the canvas everywhere the UI isn't drawn;
 * individual children re-enable events on themselves.
 *
 * UI is layered, not laid out: the canvas occupies the full surface and
 * the `<UILayer>` floats on top.
 */
export interface UILayerProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export const UILayer = ({ children, className }: UILayerProps) => (
  <div className={`du-ui-layer ${className ?? ""}`.trim()}>{children}</div>
);
