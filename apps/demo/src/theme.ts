import { useEffect, useState } from "react";

/**
 * Toggle between light / dark mode. Initial value follows the OS preference
 * (`prefers-color-scheme`) but persists across reloads in `localStorage`.
 *
 * Theme is applied as a `data-theme="light|dark"` attribute on the
 * `<html>` element — CSS in `index.html` reads it to flip colour vars.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "demo-theme";

const readInitial = (): Theme => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

export const useTheme = (): { theme: Theme; toggle: () => void } => {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = (): void => setTheme((prev) => (prev === "light" ? "dark" : "light"));
  return { theme, toggle };
};
