import type { Scene } from "@oh-just-another/scene";
import type { Emitter } from "@oh-just-another/events";
import type * as Selection from "../selection.js";
import type { Mode } from "../modes.js";
import type { EditorEvents } from "../editor-events.js";

/**
 * Holds the last-emitted snapshot of every observable Editor slice
 * so `fanOutEvents` can decide which typed events to fire on the
 * next `notify()`. Created once per Editor and primed in the
 * constructor with the initial state so the *first* user-driven
 * update only fires on a real flip.
 */
export interface EditorEventCache {
  mode: Mode | null;
  selection: Selection.Selection | null;
  scene: Scene | null;
  viewport: Scene["viewport"] | null;
  canUndo: boolean;
  canRedo: boolean;
}

export const createEventCache = (): EditorEventCache => ({
  mode: null,
  selection: null,
  scene: null,
  viewport: null,
  canUndo: false,
  canRedo: false,
});

/**
 * Snapshot of the editor's observable state at a single moment.
 * Passed to `fanOutEvents` instead of the live editor so this
 * module doesn't import the Editor class (would create a cycle).
 */
export interface EditorObservableSnapshot {
  readonly mode: Mode;
  readonly selection: Selection.Selection;
  readonly scene: Scene;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/**
 * Compare each slice against the cached last-emitted value and
 * fire only the typed events that actually flipped — then fire
 * the umbrella `change` once. Returns nothing; mutates `cache` in
 * place to the new values. Side-effect free apart from the emit
 * calls themselves.
 *
 * Scene / viewport are compared by identity (scene structures use
 * structural sharing — a new reference iff something inside
 * changed).
 */
export const fanOutEvents = (
  cache: EditorEventCache,
  events: Emitter<EditorEvents>,
  snapshot: EditorObservableSnapshot,
): void => {
  if (snapshot.mode !== cache.mode) {
    cache.mode = snapshot.mode;
    events.emit("mode", snapshot.mode);
  }
  if (snapshot.selection !== cache.selection) {
    cache.selection = snapshot.selection;
    events.emit("selection", snapshot.selection);
  }
  if (snapshot.scene !== cache.scene) {
    cache.scene = snapshot.scene;
    events.emit("scene", snapshot.scene);
  }
  if (snapshot.scene.viewport !== cache.viewport) {
    cache.viewport = snapshot.scene.viewport;
    events.emit("viewport", snapshot.scene);
  }
  if (snapshot.canUndo !== cache.canUndo || snapshot.canRedo !== cache.canRedo) {
    cache.canUndo = snapshot.canUndo;
    cache.canRedo = snapshot.canRedo;
    events.emit("history", { canUndo: snapshot.canUndo, canRedo: snapshot.canRedo });
  }
  events.emit("change");
};

/** Seed the cache with initial editor state — call once after construction. */
export const primeEventCache = (
  cache: EditorEventCache,
  snapshot: EditorObservableSnapshot,
): void => {
  cache.mode = snapshot.mode;
  cache.selection = snapshot.selection;
  cache.scene = snapshot.scene;
  cache.viewport = snapshot.scene.viewport;
  cache.canUndo = snapshot.canUndo;
  cache.canRedo = snapshot.canRedo;
};
