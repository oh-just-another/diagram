import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  TOOLTIP_HIDE_GRACE_MS,
  TOOLTIP_OFFSET_PX,
  TOOLTIP_OPEN_DELAY_MS,
  TOOLTIP_SKIP_DELAY_MS,
} from "./constants.js";

/**
 * `<Tooltip>` — modern-style hover hint with a *shared* timer so a
 * second hover within `TOOLTIP_SKIP_DELAY_MS` after the first one
 * opens skips the delay entirely. The browser's native `title=`
 * attribute is too slow (≈700 ms, OS-controlled) and impossible to
 * style, so toolbar items pipe their hint through this instead.
 *
 * Usage:
 *
 *   <TooltipProvider>          ← once near the app root
 *     …
 *     <Tooltip content="Pan (H)">
 *       <button>…</button>     ← child must be a single element
 *     </Tooltip>
 *   </TooltipProvider>
 *
 * The provider is required — without it `<Tooltip>` falls back to
 * the native `title` attribute (degraded but functional). One
 * provider per app: child timers share state so the "skip delay"
 * window survives moving the pointer between buttons.
 *
 * Singleton state lives in module scope so tooltip events from any
 * subtree converge on the same timer, identical to standard's
 * `TooltipManager`. Subscribers (the `<TooltipPortal>` rendered by
 * the provider) listen via `useSyncExternalStore`-style hooks.
 */

interface TooltipTarget {
  readonly id: string;
  readonly content: ReactNode;
  readonly side: TooltipSide;
  readonly rect: DOMRect;
}

export type TooltipSide = "top" | "bottom" | "left" | "right";

type Listener = (target: TooltipTarget | null) => void;

const listeners = new Set<Listener>();
let currentTarget: TooltipTarget | null = null;
let openTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let lastClosedAt = 0;
let pointerDown = false;

const notify = (): void => {
  for (const l of listeners) l(currentTarget);
};

const setTarget = (next: TooltipTarget | null): void => {
  currentTarget = next;
  notify();
};

const subscribe = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Open request — schedules the show (with delay or skip). */
const requestOpen = (target: TooltipTarget): void => {
  if (pointerDown) return;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (openTimer) clearTimeout(openTimer);

  const elapsedSinceLastClose = Date.now() - lastClosedAt;
  const skipDelay = currentTarget !== null
    || elapsedSinceLastClose < TOOLTIP_SKIP_DELAY_MS;

  if (skipDelay) {
    setTarget(target);
    return;
  }
  openTimer = setTimeout(() => {
    openTimer = null;
    setTarget(target);
  }, TOOLTIP_OPEN_DELAY_MS);
};

/** Close request — only acts if the leaving target matches the open one. */
const requestClose = (id: string): void => {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  if (currentTarget && currentTarget.id === id) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      lastClosedAt = Date.now();
      setTarget(null);
    }, TOOLTIP_HIDE_GRACE_MS);
  }
};

/** Hard-close — used for pointerdown / Escape / unmount. */
const forceClose = (): void => {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (currentTarget) {
    lastClosedAt = Date.now();
    setTarget(null);
  }
};

/** Provider — install once near the app root. Renders the portal. */
export const TooltipProvider = ({ children }: { readonly children: ReactNode }) => {
  // pointerdown anywhere closes — matches standard and standard.
  // Capture phase so we beat the rest of the app to the event.
  useEffect(() => {
    const onDown = (): void => {
      pointerDown = true;
      forceClose();
    };
    const onUp = (): void => {
      pointerDown = false;
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") forceClose();
    };
    document.addEventListener("pointerdown", onDown, { capture: true });
    document.addEventListener("pointerup", onUp, { capture: true });
    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onDown, { capture: true });
      document.removeEventListener("pointerup", onUp, { capture: true });
      document.removeEventListener("keydown", onKey, { capture: true });
    };
  }, []);

  return (
    <TooltipProviderCtx.Provider value={true}>
      {children}
      <TooltipPortal />
    </TooltipProviderCtx.Provider>
  );
};

const TooltipProviderCtx = createContext<boolean>(false);
const useHasProvider = (): boolean => useContext(TooltipProviderCtx);

/**
 * Internal — the singleton tooltip surface. Renders via portal into
 * `document.body` so it can sit above modal overlays.
 */
const TooltipPortal = () => {
  const [target, setTargetState] = useState<TooltipTarget | null>(null);
  useEffect(() => subscribe(setTargetState), []);

  if (!target) return null;
  if (typeof document === "undefined") return null;

  return createPortal(<TooltipSurface target={target} />, document.body);
};

const TooltipSurface = ({ target }: { readonly target: TooltipTarget }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tipRect = el.getBoundingClientRect();
    const { rect, side } = target;
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top = rect.top + rect.height / 2 - tipRect.height / 2;
    switch (side) {
      case "top":
        top = rect.top - tipRect.height - TOOLTIP_OFFSET_PX;
        break;
      case "bottom":
        top = rect.bottom + TOOLTIP_OFFSET_PX;
        break;
      case "left":
        left = rect.left - tipRect.width - TOOLTIP_OFFSET_PX;
        break;
      case "right":
        left = rect.right + TOOLTIP_OFFSET_PX;
        break;
    }
    // Clamp to viewport — keep the tooltip on-screen at edges.
    const pad = 4;
    left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - tipRect.height - pad));
    setPos({ left, top });
  }, [target]);

  const style: CSSProperties = {
    position: "fixed",
    left: pos?.left ?? -9999,
    top: pos?.top ?? -9999,
    pointerEvents: "none",
    zIndex: 10000,
    visibility: pos ? "visible" : "hidden",
  };

  return (
    <div ref={ref} role="tooltip" className="du-tooltip" style={style}>
      {target.content}
    </div>
  );
};

export interface TooltipProps {
  readonly content: ReactNode;
  /** Side relative to the trigger. Default `"bottom"`. */
  readonly side?: TooltipSide;
  /** Disable the tooltip without changing the tree. */
  readonly disabled?: boolean;
  readonly children: ReactElement;
}

/**
 * Wrap a single element to attach a shared-state tooltip. Returns
 * the child with mouse / focus handlers spliced in — the trigger's
 * existing handlers are preserved.
 */
export const Tooltip = ({ content, side = "bottom", disabled, children }: TooltipProps) => {
  const id = useId();
  const hasProvider = useHasProvider();

  // Fall back to native title= when there's no provider (degraded
  // but functional — keeps stories / isolated tests working).
  if (!hasProvider || disabled || content === undefined || content === null) {
    if (!isValidElement(children)) return children;
    if (typeof content === "string" && !disabled) {
      return cloneElement(children as ReactElement<{ title?: string }>, { title: content });
    }
    return children;
  }

  if (!isValidElement(children)) return children;

  const child = children as ReactElement<{
    onPointerEnter?: ((ev: React.PointerEvent<HTMLElement>) => void) | undefined;
    onPointerLeave?: ((ev: React.PointerEvent<HTMLElement>) => void) | undefined;
    onFocus?: ((ev: React.FocusEvent<HTMLElement>) => void) | undefined;
    onBlur?: ((ev: React.FocusEvent<HTMLElement>) => void) | undefined;
    title?: string | undefined;
  }>;

  const open = (el: HTMLElement): void => {
    requestOpen({
      id,
      content,
      side,
      rect: el.getBoundingClientRect(),
    });
  };

  const onPointerEnter = (ev: React.PointerEvent<HTMLElement>): void => {
    child.props.onPointerEnter?.(ev);
    if (ev.pointerType === "touch") return;
    open(ev.currentTarget);
  };
  const onPointerLeave = (ev: React.PointerEvent<HTMLElement>): void => {
    child.props.onPointerLeave?.(ev);
    requestClose(id);
  };
  const onFocus = (ev: React.FocusEvent<HTMLElement>): void => {
    child.props.onFocus?.(ev);
    open(ev.currentTarget);
  };
  const onBlur = (ev: React.FocusEvent<HTMLElement>): void => {
    child.props.onBlur?.(ev);
    requestClose(id);
  };

  return cloneElement(child, {
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    // Strip the native title — it would race the custom tooltip.
    title: undefined,
  });
};

