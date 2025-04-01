/**
 * WASM text shaping toggle source-of-truth: URL `?wasm=1|text` →
 * localStorage → default `false`. Mirrors the renderer-switcher's
 * URL+localStorage sync pattern.
 */
const STORAGE_KEY = "diagram.demo.wasm-text";

const truthy = (value: string | null | undefined): boolean =>
  value === "1" || value === "true" || value === "text" || value === "on";

export const readInitialWasmText = (): boolean => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("wasm");
  if (fromUrl !== null) return truthy(fromUrl);
  return window.localStorage.getItem(STORAGE_KEY) === "1";
};

export const persistWasmText = (enabled: boolean): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  const url = new URL(window.location.href);
  if (enabled) url.searchParams.set("wasm", "1");
  else url.searchParams.delete("wasm");
  window.history.replaceState(null, "", url.toString());
};
