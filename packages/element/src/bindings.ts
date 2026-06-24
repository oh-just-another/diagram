import type { EditorAPI, ElementId, Mode } from "@oh-just-another/editor";
import type { Scene } from "@oh-just-another/scene";
import type { OhDiagramElement } from "./oh-diagram-element.js";

/** Colour theme accepted by the element's `theme` attribute. */
export type DiagramTheme = "dark" | "light" | "system";
/** Renderer backend accepted by the element's `renderer` attribute. */
export type DiagramRenderer = "canvas2d" | "webgl2" | "offscreen";

/**
 * Declarative configuration of an `<oh-diagram>` element. Mirrors the
 * element's attributes (`theme` / `renderer` / `grid` / `snap`) plus the
 * `scene` property. Shared by the framework wrappers so each one binds the
 * exact same surface — there is one implementation, not one per framework.
 */
export interface OhDiagramProps {
  /** Initial / current scene. Applied through the element's `scene` property. */
  readonly scene?: Scene | undefined;
  readonly theme?: DiagramTheme | undefined;
  readonly renderer?: DiagramRenderer | undefined;
  /** Show the background grid (maps to the boolean `grid` attribute). */
  readonly grid?: boolean | undefined;
  /** Snap dragged shapes to the grid (maps to the boolean `snap` attribute). */
  readonly snap?: boolean | undefined;
}

/** Payload of each `<oh-diagram>` `CustomEvent`, keyed by event type. */
export interface OhDiagramEventMap {
  /** Editor mounted; `editor` is the live engine (or `null` mid-teardown). */
  readonly ready: { readonly editor: EditorAPI["editor"] };
  readonly scenechange: Scene;
  readonly selectionchange: readonly ElementId[];
  readonly themechange: DiagramTheme;
}

/** Optional handler per event type. */
export type OhDiagramEventHandlers = {
  readonly [K in keyof OhDiagramEventMap]?: (detail: OhDiagramEventMap[K]) => void;
};

/** The four `CustomEvent` types `<oh-diagram>` emits, in a stable order. */
export const OH_DIAGRAM_EVENTS = [
  "ready",
  "scenechange",
  "selectionchange",
  "themechange",
] as const satisfies readonly (keyof OhDiagramEventMap)[];

const toggleAttr = (el: HTMLElement, name: string, on: boolean): void => {
  if (on) el.setAttribute(name, "");
  else el.removeAttribute(name);
};

const setAttr = (el: HTMLElement, name: string, value: string | undefined): void => {
  if (value === undefined) el.removeAttribute(name);
  else el.setAttribute(name, value);
};

/**
 * Push declarative props onto a live `<oh-diagram>`. Idempotent — call it
 * on every change. Scalars map to attributes (so they reflect in the DOM and
 * drive `attributeChangedCallback`); the `scene` object is set via the
 * property (objects can't be attributes). A framework wrapper owns the
 * element, so an absent prop clears its attribute rather than leaving stale
 * markup behind.
 */
export const applyOhDiagramProps = (el: OhDiagramElement, props: OhDiagramProps): void => {
  setAttr(el, "theme", props.theme);
  setAttr(el, "renderer", props.renderer);
  toggleAttr(el, "grid", props.grid ?? false);
  toggleAttr(el, "snap", props.snap ?? false);
  if (props.scene !== undefined) el.scene = props.scene;
};

/**
 * Subscribe the given handlers to the element's `CustomEvent`s, unwrapping
 * `event.detail` to the typed payload. Returns an unbind function that
 * removes every listener — call it on teardown.
 */
export const bindOhDiagramEvents = (
  el: OhDiagramElement,
  handlers: OhDiagramEventHandlers,
): (() => void) => {
  const unsubs: (() => void)[] = [];
  // Each call fixes `K` to one literal event type, so the handler's payload
  // type lines up exactly — no union-of-callbacks intersection to cast away.
  const on = <K extends keyof OhDiagramEventMap>(
    type: K,
    handler: ((detail: OhDiagramEventMap[K]) => void) | undefined,
  ): void => {
    if (!handler) return;
    const listener = (event: Event): void => {
      handler((event as CustomEvent<OhDiagramEventMap[K]>).detail);
    };
    el.addEventListener(type, listener);
    unsubs.push(() => {
      el.removeEventListener(type, listener);
    });
  };
  on("ready", handlers.ready);
  on("scenechange", handlers.scenechange);
  on("selectionchange", handlers.selectionchange);
  on("themechange", handlers.themechange);
  return () => {
    for (const unsub of unsubs) unsub();
  };
};

/**
 * Curated imperative surface a wrapper can re-expose to its host without
 * leaking the whole element. Each method is a thin pass-through to the
 * element; before the editor is ready they are inert (the element no-ops).
 */
export interface OhDiagramController {
  getScene: () => Scene | undefined;
  loadScene: (scene: Scene) => void;
  undo: () => void;
  redo: () => void;
  zoomToFit: () => void;
  getMode: () => Mode | null;
  setMode: (mode: Mode) => void;
  getSelection: () => ReadonlySet<ElementId>;
  setSelection: (ids: Iterable<ElementId>) => void;
}

/** Build a {@link OhDiagramController} that always targets the current element. */
export const ohDiagramController = (get: () => OhDiagramElement | null): OhDiagramController => ({
  getScene: () => get()?.getScene(),
  loadScene: (scene) => get()?.loadScene(scene),
  undo: () => get()?.undo(),
  redo: () => get()?.redo(),
  zoomToFit: () => get()?.zoomToFit(),
  getMode: () => get()?.getMode() ?? null,
  setMode: (mode) => get()?.setMode(mode),
  getSelection: () => get()?.getSelection() ?? new Set<ElementId>(),
  setSelection: (ids) => get()?.setSelection(ids),
});
