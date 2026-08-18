import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Base modal / dialog primitive. Renders a backdrop plus a
 * focus-trapped centered box; closes on Esc and click-outside (the
 * latter optional via `dismissOnBackdrop=false`).
 */

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Accessible label for the dialog. Defaults to "Dialog". */
  readonly title?: string;
  readonly children: ReactNode;
  /** Click on the backdrop dismisses the modal. Default `true`. */
  readonly dismissOnBackdrop?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const Modal = ({
  open,
  onClose,
  title = "Dialog",
  children,
  dismissOnBackdrop = true,
  className,
  style,
}: ModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Esc + restore focus on close.
  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    // Focus the first focusable inside the dialog (or the box itself).
    const ref = dialogRef.current;
    if (ref) {
      const focusable = ref.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? ref).focus();
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocusedRef.current?.focus();
    };
  }, [open, onClose]);

  // Tab cycle stays inside dialog.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== "Tab") return;
      const ref = dialogRef.current;
      if (!ref) return;
      const focusables = ref.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (ev.shiftKey && active === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (!open) return null;

  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "var(--du-scrim)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "var(--du-z-modal)",
  };
  const box: CSSProperties = {
    background: "var(--du-ui-bg-solid)",
    color: "var(--du-text)",
    border: "1px solid var(--du-ui-border)",
    borderRadius: "var(--du-modal-radius)",
    boxShadow: "var(--du-modal-shadow)",
    fontFamily: "var(--du-font-family)",
    fontSize: "var(--du-font-size)",
    maxWidth: "calc(100vw - 2 * var(--du-modal-margin))",
    maxHeight: "calc(100vh - 2 * var(--du-modal-margin))",
    overflow: "auto",
    outline: "none",
    ...style,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={overlay}
      onClick={(ev) => {
        if (dismissOnBackdrop && ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={className}
        style={box}
        onClick={(ev) => {
          ev.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
};
