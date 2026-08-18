import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { scalar } from "@oh-just-another/math";

/**
 * Bottom-sheet container with swipe-to-collapse + snap points. Touch
 * drag on the handle (the grip indicator at the top edge) translates
 * the sheet vertically; on release the sheet snaps to the closest of
 * `snapPoints` (heights in viewport-percent units).
 *
 * Default snap points: 0 (closed), 50 (half), 90 (almost full). The
 * `value` / `onChange` pair makes it controlled; uncontrolled hosts
 * can omit them and let the sheet manage its own state from
 * `defaultValue`.
 */
export interface BottomSheetProps {
  readonly children: ReactNode;
  /** Snap points in vh (0–100). Defaults to `[0, 50, 90]`. */
  readonly snapPoints?: readonly number[];
  /** Controlled height in vh. */
  readonly value?: number;
  /** Initial height in vh when uncontrolled. Default = first snap > 0. */
  readonly defaultValue?: number;
  readonly onChange?: (vh: number) => void;
  readonly className?: string;
  readonly style?: CSSProperties;
}

const DEFAULT_SNAPS: readonly number[] = [0, 50, 90];

export const BottomSheet = ({
  children,
  snapPoints = DEFAULT_SNAPS,
  value,
  defaultValue,
  onChange,
  className,
  style,
}: BottomSheetProps) => {
  const [internal, setInternal] = useState<number>(
    () => defaultValue ?? snapPoints.find((s) => s > 0) ?? 50,
  );
  const current = value ?? internal;
  const setHeight = useCallback(
    (next: number): void => {
      setInternal(next);
      onChange?.(next);
    },
    [onChange],
  );

  const dragState = useRef<{ startY: number; startHeight: number; pointerId: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const onPointerDown = (ev: React.PointerEvent<HTMLDivElement>): void => {
    dragState.current = { startY: ev.clientY, startHeight: current, pointerId: ev.pointerId };
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- setPointerCapture typed non-optional but absent on non-element/older targets
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent<HTMLDivElement>): void => {
    if (dragState.current?.pointerId !== ev.pointerId) return;
    const vh = window.innerHeight || 1;
    const deltaPct = ((dragState.current.startY - ev.clientY) / vh) * 100;
    const next = scalar.clamp(dragState.current.startHeight + deltaPct, 0, 100);
    setHeight(next);
  };

  const onPointerUp = (ev: React.PointerEvent<HTMLDivElement>): void => {
    if (dragState.current?.pointerId !== ev.pointerId) return;
    dragState.current = null;
    // Snap to nearest snap point.
    let best = snapPoints[0];
    if (best === undefined) return;
    let bestDist = Math.abs(current - best);
    for (const sp of snapPoints) {
      const dist = Math.abs(current - sp);
      if (dist < bestDist) {
        best = sp;
        bestDist = dist;
      }
    }
    setHeight(best);
  };

  // ESC closes the sheet (snap to the smallest snap point).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") setHeight(Math.min(...snapPoints));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [setHeight, snapPoints]);

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-label="Bottom sheet"
      className={className}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: `${current}vh`,
        background: "var(--du-ui-bg-solid)",
        color: "var(--du-text)",
        borderTop: "1px solid var(--du-ui-border)",
        borderTopLeftRadius: "var(--du-radius-lg)",
        borderTopRightRadius: "var(--du-radius-lg)",
        boxShadow: "var(--du-modal-shadow)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: dragState.current ? "none" : "height var(--du-motion-sheet)",
        zIndex: "var(--du-z-ui)",
        ...style,
      }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="du-sheet-grip"
      >
        <span aria-hidden className="du-sheet-grip-bar" />
      </div>
      <div className="du-sheet-body">{children}</div>
    </div>
  );
};
