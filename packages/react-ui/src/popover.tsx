import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type Placement,
} from "@floating-ui/dom";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Floating popover primitive. Wraps a trigger element and renders its
 * children into a portal whose position is computed via
 * `@floating-ui/dom` (offset + flip + shift). Closed by default;
 * clicking the trigger toggles; clicking outside or pressing Esc
 * closes.
 *
 * Used inside `<SelectionFloatingPanel>` for sub-controls that don't
 * fit inline (color picker, corner radius slider, opacity slider).
 * Uses the DOM-only `@floating-ui/dom` API plus a small outside-click
 * hook rather than `@floating-ui/react`.
 */
export interface PopoverProps {
  /** Element that opens the popover when clicked. Must accept a ref. */
  readonly trigger: ReactElement;
  /** Content rendered inside the popover. */
  readonly children: ReactNode;
  /** Preferred placement; flip middleware will try fallbacks. Default `"bottom-start"`. */
  readonly placement?: Placement;
  /** Distance in px between trigger and popover. Default `6`. */
  readonly offset?: number;
  /** Optional className for the floating panel chrome. */
  readonly className?: string;
  /** Controlled-open state. If omitted, popover manages its own state. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** ARIA label for the popover region. */
  readonly ariaLabel?: string;
}

export const Popover = ({
  trigger,
  children,
  placement = "bottom-start",
  offset: gap = 6,
  className,
  open: openProp,
  onOpenChange,
  ariaLabel,
}: PopoverProps) => {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setOpenState(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Position recompute. `autoUpdate` watches scroll / resize and calls
  // back; this re-runs `computePosition`. Re-runs after every render
  // where `open` flipped to true (anchors might have moved while closed).
  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current;
    const p = popoverRef.current;
    if (!t || !p) return;
    const update = () => {
      void computePosition(t, p, {
        placement,
        middleware: [offset(gap), flip(), shift({ padding: 6 })],
      }).then(({ x, y }) => {
        p.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      });
    };
    update();
    const cleanup = autoUpdate(t, p, update);
    return cleanup;
  }, [open, placement, gap]);

  // Outside-click + Escape close. Bound only while open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  // Clone the user's trigger element, injecting ref + onClick + aria.
  // The trigger's own onClick (if any) is preserved and fires first.
  const triggerWithProps = useMemo(() => {
    if (!isValidElement(trigger)) return trigger;
    const existing = (trigger.props as Record<string, unknown>) ?? {};
    return cloneElement(trigger, {
      ref: (el: HTMLElement | null) => {
        triggerRef.current = el;
        const r = (trigger as unknown as { ref?: unknown }).ref;
        if (typeof r === "function") (r as (n: HTMLElement | null) => void)(el);
        else if (r && typeof r === "object")
          (r as { current: HTMLElement | null }).current = el;
      },
      onClick: (ev: React.MouseEvent) => {
        const prev = existing["onClick"] as
          | ((ev: React.MouseEvent) => void)
          | undefined;
        prev?.(ev);
        if (ev.defaultPrevented) return;
        setOpen(!open);
      },
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "aria-controls": open ? id : undefined,
    } as Record<string, unknown>);
  }, [trigger, open, setOpen, id]);

  return (
    <>
      {triggerWithProps}
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={id}
              role="dialog"
              aria-label={ariaLabel}
              className={`du-popover ${className ?? ""}`.trim()}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                // `transform` is updated by the `computePosition` callback
                // above. The pre-paint at (0,0) is hidden by the CSS
                // opacity 0 → 1 animation on `.du-popover`.
                zIndex: 1600,
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
