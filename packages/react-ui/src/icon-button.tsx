import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Tooltip } from "./tooltip.js";

/**
 * Square clickable button — the base primitive for the top / bottom
 * bars and panel headers. Style comes entirely from `du-icon-button` in
 * `diagram-ui.css`; hosts override via CSS variables, not inline `style`.
 *
 * Active state is signalled through `aria-pressed` (the CSS hooks onto
 * `[aria-pressed="true"]`). For tools that toggle on/off pass
 * `active={true}`; for momentary actions omit it.
 *
 * The tooltip uses the shared `<TooltipProvider>` singleton so a second
 * hover within the open-delay window skips the delay.
 */
export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /**
   * Accessible name and tooltip text. Required. Renders through
   * `<Tooltip>` (singleton) when a `<TooltipProvider>` is mounted; falls
   * back to native `title=` otherwise.
   */
  readonly label: string;
  /** Toggle state: maps to `aria-pressed` and a CSS `is-active` class. */
  readonly active?: boolean;
  /** Compact 28-px variant for dense panels (e.g. side-panel headers). */
  readonly size?: "default" | "sm";
  readonly children: ReactNode;
}

export const IconButton = ({
  label,
  active,
  size = "default",
  className,
  children,
  ...rest
}: IconButtonProps) => {
  const cls = [
    "du-icon-button",
    size === "sm" ? "du-icon-button-sm" : "",
    active ? "is-active" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={cls}
        aria-label={label}
        aria-pressed={active ?? undefined}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
};
