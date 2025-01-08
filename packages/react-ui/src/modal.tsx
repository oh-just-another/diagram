import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

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
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
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
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;

  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };
  const box: CSSProperties = {
    background: "var(--panel, #1a1a1a)",
    color: "var(--text, #ddd)",
    border: "1px solid var(--border, #2a2a2a)",
    borderRadius: 8,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.45)",
    maxWidth: "calc(100vw - 64px)",
    maxHeight: "calc(100vh - 64px)",
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
        onClick={(ev) => ev.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
