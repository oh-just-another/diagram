import type { ReactNode } from "react";

/**
 * modern-style 3-zone bar (left / center / right). Sits at the
 * top or bottom of the canvas with a small inset margin. Each zone
 * is an inline-flex row of buttons / button-groups; the wrapper
 * keeps them at the edges + centred middle without flex shrinking
 * (passing `null` for a zone collapses that slot cleanly).
 *
 * `pointer-events: none` on the bar itself means clicks pass
 * through to the canvas; only the buttons inside the zones receive
 * events. The CSS handles that via `du-bar > * { pointer-events:
 * auto }` so authors don't have to think about it.
 */
export interface DiagramBarProps {
  readonly left?: ReactNode;
  readonly center?: ReactNode;
  readonly right?: ReactNode;
}

export const TopBar = ({ left, center, right }: DiagramBarProps) => (
  <div className="du-bar du-bar-top">
    <div className="du-bar-zone">{left}</div>
    {center !== undefined && center !== null ? (
      <div className="du-bar-zone du-bar-zone-center">{center}</div>
    ) : (
      <div />
    )}
    <div className="du-bar-zone">{right}</div>
  </div>
);

export const BottomBar = ({ left, center, right }: DiagramBarProps) => (
  <div className="du-bar du-bar-bottom">
    <div className="du-bar-zone">{left}</div>
    {center !== undefined && center !== null ? (
      <div className="du-bar-zone du-bar-zone-center">{center}</div>
    ) : (
      <div />
    )}
    <div className="du-bar-zone">{right}</div>
  </div>
);
