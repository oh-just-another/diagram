import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { TOAST_DEFAULT_DURATION_MS } from "../core/constants.js";

/**
 * In-process toast bus. Hosts mount `<ToastHost>` once at the root;
 * descendants call `useToast()` to push messages. Each toast dismisses
 * itself after `duration` ms; the × button closes it manually.
 */

export type ToastKind = "info" | "success" | "warn" | "error";

export interface Toast {
  readonly id: string;
  readonly kind: ToastKind;
  readonly message: string;
  /** ms before auto-dismiss; 0 / Infinity keeps it open. */
  readonly duration?: number;
}

export interface ToastApi {
  push(message: string, kind?: ToastKind, duration?: number): string;
  dismiss(id: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast: must be wrapped in <ToastHost>");
  return ctx;
};

/** Like `useToast` but returns null instead of throwing. */
export const useToastOptional = (): ToastApi | null => useContext(ToastContext);

export interface ToastHostProps {
  readonly children?: ReactNode;
  /** Default duration for `push` calls that omit the argument. */
  readonly defaultDuration?: number;
  readonly style?: CSSProperties;
}

export const ToastHost = ({
  children,
  defaultDuration = TOAST_DEFAULT_DURATION_MS,
  style,
}: ToastHostProps) => {
  const [items, setItems] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = "info", duration?: number) => {
      const id = `toast-${++counter.current}`;
      const ttl = duration ?? defaultDuration;
      setItems((prev) => [...prev, { id, kind, message, duration: ttl }]);
      if (ttl > 0 && Number.isFinite(ttl)) {
        window.setTimeout(() => {
          dismiss(id);
        }, ttl);
      }
      return id;
    },
    [defaultDuration, dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack toasts={items} onDismiss={dismiss} {...(style ? { style } : {})} />
    </ToastContext.Provider>
  );
};

const ToastStack = ({
  toasts,
  onDismiss,
  style,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
  style?: CSSProperties | undefined;
}) => {
  const stackStyle: CSSProperties = {
    position: "fixed",
    top: "var(--du-toast-inset)",
    right: "var(--du-toast-inset)",
    zIndex: "var(--du-z-toast)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--du-gap)",
    pointerEvents: "none",
    ...style,
  };
  return (
    <div style={stackStyle} aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const KIND_ACCENT: Record<ToastKind, string> = {
  info: "var(--du-accent)",
  success: "var(--du-success)",
  warn: "var(--du-warning)",
  error: "var(--du-danger)",
};

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) => {
  const itemStyle: CSSProperties = {
    borderLeft: `var(--du-space-sm) solid ${KIND_ACCENT[toast.kind]}`,
  };
  return (
    <div role="status" className="du-toast" style={itemStyle}>
      <span className="du-toast-message">{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          onDismiss(toast.id);
        }}
        className="du-toast-dismiss"
      >
        ×
      </button>
    </div>
  );
};

/**
 * Auto-mount helper for hosts that want a single ToastHost at the top
 * of their component tree without writing the JSX themselves.
 */
export const useEphemeralToast = (message: string, kind: ToastKind = "info"): void => {
  const toast = useToastOptional();
  useEffect(() => {
    if (toast && message) toast.push(message, kind);
  }, [toast, message, kind]);
};
