/**
 * Framework-agnostic debounced autosave controller.
 *
 * Coalesces a burst of scene mutations (pan / drag / typing fire one
 * per frame) into a single persist call after `debounceMs` of quiet.
 * `flush()` persists the pending scene immediately — wire it to
 * `visibilitychange` / `pagehide` so an edit made inside the debounce
 * window survives a reload or tab close.
 *
 * Pure of any DOM / React: it only touches `setTimeout` and the `write`
 * callback passed in, which keeps it unit-testable with fake timers.
 */
export interface SceneAutosave<S> {
  /** Record the latest scene and arm the debounce if idle. */
  schedule(scene: S): void;
  /** Cancel the debounce and persist the latest pending scene now. */
  flush(): void;
  /** Drop the timer without writing (component unmount). */
  cancel(): void;
}

export const createSceneAutosave = <S>(
  write: (scene: S) => void,
  debounceMs: number,
): SceneAutosave<S> => {
  let pending: S | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const persist = () => {
    const s = pending;
    if (s === null) return;
    pending = null;
    write(s);
  };

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    schedule(scene) {
      pending = scene;
      if (timer !== null) return; // a flush is already scheduled
      timer = setTimeout(() => {
        timer = null;
        persist();
      }, debounceMs);
    },
    flush() {
      clear();
      persist();
    },
    cancel() {
      clear();
    },
  };
};
