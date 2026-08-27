import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Browser fullscreen for one element: `active` mirrors
 * `document.fullscreenElement`, `toggle` enters fullscreen on the ref's
 * element or exits. `supported` is `false` where the Fullscreen API is
 * missing (older iOS Safari, sandboxed frames) so hosts can hide the
 * control. Never throws — a rejected request just leaves `active` false.
 */
export const useFullscreen = (
  ref: RefObject<HTMLElement | null>,
): { readonly active: boolean; readonly supported: boolean; readonly toggle: () => void } => {
  const supported =
    typeof document !== "undefined" && typeof document.exitFullscreen === "function";
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!supported) return undefined;
    const sync = () => {
      const el = ref.current;
      setActive(el !== null && document.fullscreenElement === el);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
    };
  }, [ref, supported]);
  const toggle = useCallback(() => {
    if (!supported) return;
    const el = ref.current;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (el && typeof el.requestFullscreen === "function") {
      void el.requestFullscreen().catch(() => undefined);
    }
  }, [ref, supported]);
  return { active, supported, toggle };
};
