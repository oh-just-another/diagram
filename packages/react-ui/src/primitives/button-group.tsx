import type { ReactNode } from "react";

/**
 * Visual pill that wraps a row of `<IconButton>`s. The CSS strips
 * individual button borders / shadows and re-applies them at the
 * group level so the row reads as one cohesive control. Used for
 * Toolbar tools, zoom controls etc.
 */
export interface ButtonGroupProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly ariaLabel?: string;
}

export const ButtonGroup = ({ children, className, ariaLabel }: ButtonGroupProps) => (
  <div className={`du-button-group ${className ?? ""}`.trim()} role="group" aria-label={ariaLabel}>
    {children}
  </div>
);
