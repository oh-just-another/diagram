/**
 * Tiny typed event emitter with zero deps. Type-safe `on/off/emit`
 * driven by the event-map type parameter, exposing the listener set
 * as a first-class object so consumers can compose multiple emitters
 * into a bus.
 *
 * The event map is a record where keys are event names and values are
 * listener signatures; `() => void` is fine for fire-and-forget pings.
 *
 *   interface EditorEvents {
 *     mode: (mode: Mode) => void;
 *     selection: (sel: Selection) => void;
 *     change: () => void;
 *   }
 *
 *   const emitter = createEmitter<EditorEvents>();
 *   emitter.on('mode', (m) => log(m));   // m: Mode (inferred)
 *   emitter.emit('mode', 'select');       // typecheck the payload
 *
 * `emit` returns the number of listeners that ran.
 *
 * Listener exceptions do NOT abort the emit loop: subsequent listeners
 * still run, and the first thrown error is re-thrown synchronously
 * after the loop (matching DOM EventTarget semantics).
 *
 * Listeners are snapshotted before iteration, so `off()` / `on()` calls
 * from inside a listener take effect on the next emit.
 */

/**
 * Marker for any function type. Exposed for consumers writing
 * helper types around an `Emitter`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyListener = (...args: any[]) => void;

/**
 * Conventional event map shape. Consumers don't have to satisfy this
 * when parameterising `Emitter<E>` (`E` is unconstrained so `interface`
 * event maps work), but most maps look like this.
 */
export type EventMap = Record<string, AnyListener>;

/**
 * Typed pub/sub. `E` describes the events the emitter knows about; each
 * value in `E` is the listener signature. `emit` infers payload types
 * from `E[K]` so the call site is checked.
 */
export interface Emitter<E> {
  /**
   * Subscribe to an event. Returns an unsubscribe function. Idempotent:
   * calling the returned function twice is a no-op.
   */
  on<K extends keyof E>(
    event: K,
    fn: E[K] extends AnyListener ? E[K] : never,
  ): () => void;
  /** Unsubscribe a previously registered listener. No-op if not found. */
  off<K extends keyof E>(
    event: K,
    fn: E[K] extends AnyListener ? E[K] : never,
  ): void;
  /**
   * Synchronously call every listener registered for `event` with the
   * supplied arguments. Returns the number of listeners that ran.
   * Re-throws the first listener error after the loop completes;
   * subsequent errors are dropped (mirrors DOM EventTarget).
   */
  emit<K extends keyof E>(
    event: K,
    ...args: E[K] extends (...args: infer A) => void ? A : never
  ): number;
  /**
   * Remove every listener for `event`, or every listener for every
   * event when no argument is supplied.
   */
  clear<K extends keyof E>(event?: K): void;
  /** Number of listeners currently registered for `event`. */
  listenerCount<K extends keyof E>(event: K): number;
}

/** Creates a fresh typed emitter. */
export const createEmitter = <E>(): Emitter<E> => {
  const listeners = new Map<keyof E, Set<AnyListener>>();

  const on: Emitter<E>["on"] = (event, fn) => {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(fn);
    return () => {
      const s = listeners.get(event);
      if (!s) return;
      s.delete(fn);
      if (s.size === 0) listeners.delete(event);
    };
  };

  const off: Emitter<E>["off"] = (event, fn) => {
    const s = listeners.get(event);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) listeners.delete(event);
  };

  const emit: Emitter<E>["emit"] = (event, ...args) => {
    const s = listeners.get(event);
    if (!s || s.size === 0) return 0;
    // Snapshot so concurrent on/off inside listeners do not mutate
    // the iteration target — feedback is deferred to the next emit.
    const snapshot = Array.from(s);
    let firstError: Error | null = null;
    let count = 0;
    for (const fn of snapshot) {
      try {
        fn(...args);
        count++;
      } catch (err) {
        firstError ??= err instanceof Error ? err : new Error(String(err));
      }
    }
    if (firstError !== null) throw firstError;
    return count;
  };

  const clear: Emitter<E>["clear"] = (event) => {
    if (event === undefined) {
      listeners.clear();
      return;
    }
    listeners.delete(event);
  };

  const listenerCount: Emitter<E>["listenerCount"] = (event) => {
    const s = listeners.get(event);
    return s ? s.size : 0;
  };

  return { on, off, emit, clear, listenerCount };
};
