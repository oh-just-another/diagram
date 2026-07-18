import { useCallback, useEffect, useRef } from "react";

/** Imperative delayed-callback timer: schedule(ms) runs cb after the delay; cancel() clears it. Auto-cleared on unmount. */
export const useDismissTimer = (
  cb: () => void,
): { schedule: (ms: number) => void; cancel: () => void } => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const schedule = useCallback(
    (ms: number) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        cbRef.current();
      }, ms);
    },
    [cancel],
  );
  useEffect(() => cancel, [cancel]);
  return { schedule, cancel };
};
