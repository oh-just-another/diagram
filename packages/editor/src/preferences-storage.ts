import {
  DEFAULT_EDITOR_PREFERENCES,
  type Editor,
  type EditorPreferences,
  type WheelMode,
} from "@oh-just-another/state";

/** Default `localStorage` key for `<Diagram persistPreferences>`. */
export const DEFAULT_PREFERENCES_STORAGE_KEY = "diagram-preferences";

const WHEEL_MODES: readonly WheelMode[] = ["auto", "mouse", "trackpad"];

/**
 * Parse a stored preferences blob, keeping only known keys with valid
 * values so a stale / hand-edited entry can never poison the editor.
 */
export const parseStoredPreferences = (raw: string | null): Partial<EditorPreferences> => {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null) return {};
  const o = data as Record<string, unknown>;
  const out: { -readonly [K in keyof EditorPreferences]?: EditorPreferences[K] } = {};
  for (const key of ["snapObjects", "showObjectSize", "suggestObjectSize"] as const) {
    if (typeof o[key] === "boolean") out[key] = o[key];
  }
  if (WHEEL_MODES.includes(o.wheelMode as WheelMode)) out.wheelMode = o.wheelMode as WheelMode;
  return out;
};

/** Read the persisted preferences (missing / invalid → `{}`). */
export const loadPreferences = (key: string): Partial<EditorPreferences> => {
  if (typeof window === "undefined") return {};
  try {
    return parseStoredPreferences(window.localStorage.getItem(key));
  } catch {
    return {};
  }
};

/**
 * Apply the persisted preferences to `editor` and write every later change
 * back under `key`. Returns the unsubscribe function. Storage errors
 * (private mode, quota) are swallowed — preferences then live for the
 * session only.
 */
export const bindPreferencesPersistence = (editor: Editor, key: string): (() => void) => {
  editor.setPreferences({ ...DEFAULT_EDITOR_PREFERENCES, ...loadPreferences(key) });
  let last = editor.preferences;
  return editor.subscribe(() => {
    if (editor.preferences === last) return;
    last = editor.preferences;
    try {
      window.localStorage.setItem(key, JSON.stringify(last));
    } catch {
      // Best effort — see the doc comment.
    }
  });
};
