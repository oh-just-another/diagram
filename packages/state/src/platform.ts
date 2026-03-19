/**
 * Platform / device detection. Detection runs once at module load.
 * SSR / Node returns `false` for everything (no `navigator`). Hosts
 * that need stricter detection can shadow these via dependency
 * injection in their own setup.
 */

const ua = (): string => (typeof navigator !== "undefined" ? navigator.userAgent : "");
const platform = (): string =>
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- `navigator.platform` is deprecated but remains the canonical OS-detection source; no non-deprecated equivalent
  typeof navigator !== "undefined" ? navigator.platform || "" : "";

/** macOS or iOS Safari. */
export const isMac = /Mac|iPod|iPhone|iPad/.test(platform());

/** Microsoft Windows. */
export const isWindows = platform().startsWith("Win");

/** Android device (any browser). */
export const isAndroid = /\b(android)\b/i.test(ua());

/**
 * iOS (iPhone / iPad). Modern iPadOS reports `MacIntel` in
 * `navigator.platform`, so this ORs with a touch-point check —
 * `maxTouchPoints > 1` plus a `Mac` substring.
 */
export const isIOS =
  /iPad|iPhone/i.test(platform()) ||
  (typeof navigator !== "undefined" &&
    /Mac/i.test(platform()) &&
    typeof (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints === "number" &&
    (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1);

/** Linux desktop. */
export const isLinux = /Linux/i.test(platform()) && !isAndroid;

/** Firefox — useful for browser-specific quirks. */
export const isFirefox = /Firefox/i.test(ua());

/** Safari (excluding Chrome-on-iOS which also reports Safari). */
export const isSafari = /^((?!chrome|android).)*safari/i.test(ua());

/**
 * Current device-pixel-ratio. Live read (not cached) — DPR changes
 * when the user drags the window between monitors. Defaults to 1
 * in non-browser environments.
 */
export const getDevicePixelRatio = (): number =>
  typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

/**
 * Whether the platform's "command" modifier is the Meta key
 * (macOS) or Ctrl key (everything else). Use this to decide which
 * KeyboardEvent flag to read for portable hotkey logic.
 *
 *   const ev = ...; if (ev[CTRL_OR_CMD_KEY] && ev.key === "z") ...
 */
export const CTRL_OR_CMD_KEY: "metaKey" | "ctrlKey" = isMac ? "metaKey" : "ctrlKey";

/**
 * Pretty-print a hotkey as the user will see it on a help dialog
 * or tooltip — uses Mac glyphs (⌘ ⌥ ⇧ ⌃ ⏎ ⌫) on macOS and English
 * names ("Ctrl+Shift+Z", "Alt", "Enter", "Delete") elsewhere.
 *
 * Input is the same `HotkeyMatcher` shape the Action registry uses;
 * the formatter is platform-aware so help text reads naturally on
 * whichever platform the user is on.
 */
export interface PrettyHotkeyDesc {
  readonly key?: string;
  readonly code?: string;
  readonly meta?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
}

const KEY_LABEL_MAC: Record<string, string> = {
  Enter: "⏎",
  Backspace: "⌫",
  Delete: "⌦",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  Tab: "⇥",
  " ": "Space",
};

const KEY_LABEL_OTHER: Record<string, string> = {
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Del",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  Tab: "Tab",
  " ": "Space",
};

/**
 * Same as `formatHotkey` but returns the labels as a separate
 * array so the caller can render each key as its own UI chip
 * (modern-style "kbd-as-button" cells in the help dialog).
 * Order matches `formatHotkey`'s join order: modifiers first
 * (platform-correct sequence), then the key itself last.
 *
 * Example:
 *   formatHotkeyParts({ meta: true, shift: true, key: "z" })
 *     → ["⌃", "⇧", "Z"]  on macOS
 *     → ["Ctrl", "Shift", "Z"]  elsewhere
 */
export const formatHotkeyParts = (desc: PrettyHotkeyDesc): string[] => {
  const parts: string[] = [];
  if (isMac) {
    if (desc.ctrl) parts.push("⌃");
    if (desc.alt) parts.push("⌥");
    if (desc.shift) parts.push("⇧");
    if (desc.meta) parts.push("⌘");
  } else {
    if (desc.meta) parts.push("Ctrl");
    if (desc.ctrl) parts.push("Ctrl");
    if (desc.alt) parts.push("Alt");
    if (desc.shift) parts.push("Shift");
  }
  const keyLabels = isMac ? KEY_LABEL_MAC : KEY_LABEL_OTHER;
  const k = desc.key ?? desc.code ?? "";
  const labelled = keyLabels[k] ?? (k.length === 1 ? k.toUpperCase() : k);
  parts.push(labelled);
  return parts;
};

export const formatHotkey = (desc: PrettyHotkeyDesc): string => {
  const parts = formatHotkeyParts(desc);
  return isMac ? parts.join("") : parts.join("+");
};
