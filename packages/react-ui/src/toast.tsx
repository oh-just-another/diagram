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
import { TOAST_DEFAULT_DURATION_MS } from "./constants.js";

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
        window.setTimeout(() => dismiss(id), ttl);
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
    top: 16,
    right: 16,
    zIndex: 1100,
    display: "flex",
    flexDirection: "column",
    gap: 8,
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
  info: "var(--accent, #1a73e8)",
  success: "#2e8b57",
  warn: "#c79100",
  error: "#c83232",
};

const ToastItem = ({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) => {
  const itemStyle: CSSProperties = {
    pointerEvents: "auto",
    minWidth: 240,
    maxWidth: 360,
    padding: "10px 12px",
    background: "var(--panel, #1a1a1a)",
    color: "var(--text, #ddd)",
    border: "1px solid var(--border, #2a2a2a)",
    borderLeft: `4px solid ${KIND_ACCENT[toast.kind]}`,
    borderRadius: 4,
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3)",
    fontSize: 13,
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  };
  return (
    <div role="status" style={itemStyle}>
      <span style={{ flex: 1, lineHeight: 1.35 }}>{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted, #888)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
        }}
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
