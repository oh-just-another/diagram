import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_PREFERENCES,
  type Editor,
  type EditorPreferences,
} from "@oh-just-another/state";
import { bindPreferencesPersistence, parseStoredPreferences } from "../src/preferences-storage";

describe("parseStoredPreferences", () => {
  it("keeps only known keys with valid values", () => {
    expect(parseStoredPreferences(null)).toEqual({});
    expect(parseStoredPreferences("not json")).toEqual({});
    expect(
      parseStoredPreferences(
        JSON.stringify({
          snapObjects: false,
          wheelMode: "trackpad",
          showObjectSize: "yes",
          extra: 1,
        }),
      ),
    ).toEqual({ snapObjects: false, wheelMode: "trackpad" });
    expect(parseStoredPreferences(JSON.stringify({ wheelMode: "pen" }))).toEqual({});
  });
});

describe("bindPreferencesPersistence", () => {
  const fakeEditor = () => {
    let prefs: EditorPreferences = DEFAULT_EDITOR_PREFERENCES;
    const listeners = new Set<() => void>();
    const editor = {
      get preferences() {
        return prefs;
      },
      setPreferences: (patch: Partial<EditorPreferences>) => {
        prefs = { ...prefs, ...patch };
        for (const l of listeners) l();
      },
      subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    } as unknown as Editor;
    return editor;
  };

  it("applies the stored value on bind and writes later changes back", () => {
    const key = "test-prefs";
    window.localStorage.setItem(key, JSON.stringify({ wheelMode: "mouse" }));
    const editor = fakeEditor();
    const unbind = bindPreferencesPersistence(editor, key);
    expect(editor.preferences.wheelMode).toBe("mouse");
    editor.setPreferences({ snapObjects: false });
    expect(JSON.parse(window.localStorage.getItem(key)!)).toMatchObject({
      wheelMode: "mouse",
      snapObjects: false,
    });
    unbind();
    editor.setPreferences({ snapObjects: true });
    expect(JSON.parse(window.localStorage.getItem(key)!).snapObjects).toBe(false);
    window.localStorage.removeItem(key);
  });
});
