import { DEFAULT_SCENE, type Scene } from "./scene.js";
import type { Viewport } from "./viewport.js";

/**
 * Where a scene setting is persisted:
 * - `export` — saved into the document (scene.json / collab snapshot),
 * - `browser` — kept locally only (e.g. localStorage),
 * - `ephemeral` — session only, never persisted.
 */
export type SettingScope = "export" | "browser" | "ephemeral";

/** Persistence scope per viewport setting. Complete over `keyof Viewport`. */
export const VIEWPORT_SCOPE = {
  pan: "browser",
  zoom: "browser",
  rotation: "browser",
  size: "ephemeral",
  gridEnabled: "export",
  gridStyle: "export",
  snapToGrid: "export",
} as const satisfies Record<keyof Viewport, SettingScope>;

const VIEWPORT_KEYS = Object.keys(VIEWPORT_SCOPE) as (keyof Viewport)[];

const EPHEMERAL_VIEWPORT_KEYS = VIEWPORT_KEYS.filter((key) => VIEWPORT_SCOPE[key] === "ephemeral");

/** Host-supplied setting overrides accepted by hydration. */
export interface SceneSettings {
  readonly viewport?: Partial<Viewport>;
}

/**
 * Inputs to {@link hydrateScene}, in increasing priority:
 * `DEFAULT_SCENE` < `hostSettings` < `saved`.
 */
export interface HydrateInput {
  /** Persisted / dehydrated scene (user data): settings + entities. */
  readonly saved?: Partial<Scene>;
  /** Host-supplied setting overrides — lower priority than `saved`. */
  readonly hostSettings?: SceneSettings;
}

/**
 * Layer partial viewports over `base` key by key. Only known keys are
 * applied; `undefined` values are skipped (the lower layer keeps its value).
 */
const mergeViewport = (
  base: Viewport,
  ...overrides: readonly (Partial<Viewport> | undefined)[]
): Viewport => {
  let out = base;
  for (const override of overrides) {
    if (!override) continue;
    for (const key of VIEWPORT_KEYS) {
      if (override[key] !== undefined) {
        out = { ...out, [key]: override[key] };
      }
    }
  }
  return out;
};

/**
 * Build a Scene by layering settings over {@link DEFAULT_SCENE}. Settings
 * resolve per key (default < host < saved), unknown keys are dropped, and
 * missing keys fall back to the default. Entity maps come from `saved`
 * wholesale (copied into fresh maps), not merged key by key.
 */
export const hydrateScene = (input: HydrateInput = {}): Scene => {
  const { saved, hostSettings } = input;
  return {
    elements: new Map(saved?.elements ?? DEFAULT_SCENE.elements),
    links: new Map(saved?.links ?? DEFAULT_SCENE.links),
    layers: new Map(saved?.layers ?? DEFAULT_SCENE.layers),
    annotations: new Map(saved?.annotations ?? DEFAULT_SCENE.annotations),
    files: new Map(saved?.files ?? DEFAULT_SCENE.files),
    viewport: mergeViewport(DEFAULT_SCENE.viewport, hostSettings?.viewport, saved?.viewport),
  };
};

/**
 * Prepare a Scene for persistence: reset ephemeral-scope settings to their
 * defaults so transient session state (e.g. container size) is not stored.
 */
export const dehydrateScene = (scene: Scene): Scene => {
  let viewport = scene.viewport;
  for (const key of EPHEMERAL_VIEWPORT_KEYS) {
    viewport = { ...viewport, [key]: DEFAULT_SCENE.viewport[key] };
  }
  return { ...scene, viewport };
};
