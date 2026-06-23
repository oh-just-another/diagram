/** A minimal fan-out listener set: add returns an unsubscribe; emit notifies all. */
export interface Listeners<T> {
  readonly add: (fn: (value: T) => void) => () => void;
  readonly emit: (value: T) => void;
  readonly clear: () => void;
  readonly size: () => number;
}

export const createListeners = <T = void>(): Listeners<T> => {
  const fns = new Set<(value: T) => void>();
  return {
    add: (fn) => {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    emit: (value) => {
      // snapshot so a listener that unsubscribes mid-emit doesn't skip others
      for (const fn of [...fns]) fn(value);
    },
    clear: () => {
      fns.clear();
    },
    size: () => fns.size,
  };
};
