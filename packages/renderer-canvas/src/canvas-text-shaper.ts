import type { ShaperFont, TextShaper } from "@oh-just-another/renderer-core";

/**
 * Default `TextShaper` for Canvas2D backends. Uses an off-screen
 * `<canvas>` 2D context to call `measureText` per query, with a
 * tiny LRU cache keyed by `(family, size, weight, style, text)` so
 * repeated layout passes (re-renders of the same scene) don't
 * re-pay the measurement cost.
 *
 * Falls back to a heuristic when no DOM canvas is available (SSR /
 * Node) — `width = text.length * fontSize * 0.55`.
 */

const CACHE_LIMIT = 4_096;

export class Canvas2DTextShaper implements TextShaper {
  private readonly cache = new Map<string, number>();
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor() {
    if (typeof document !== "undefined") {
      const c = document.createElement("canvas");
      this.ctx = c.getContext("2d");
    } else {
      this.ctx = null;
    }
  }

  measure(text: string, font: ShaperFont): { width: number } {
    if (!this.ctx) {
      // SSR / Node fallback.
      return { width: text.length * font.size * 0.55 };
    }
    const key = this.keyFor(text, font);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      // Touch — LRU.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return { width: cached };
    }
    this.ctx.font = fontSpec(font);
    const w = this.ctx.measureText(text).width;
    this.cache.set(key, w);
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return { width: w };
  }

  private keyFor(text: string, font: ShaperFont): string {
    return `${font.family}|${font.size}|${font.weight ?? "normal"}|${font.style ?? "normal"}|${text}`;
  }
}

const fontSpec = (font: ShaperFont): string => {
  const weight = font.weight ?? "normal";
  const style = font.style ?? "normal";
  return `${style} ${weight} ${font.size}px ${font.family}`;
};
