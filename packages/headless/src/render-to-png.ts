import type { Scene } from "@oh-just-another/scene";
import type { RenderSceneToSvgOptions } from "@oh-just-another/renderer-svg";
import { UI_SURFACE } from "@oh-just-another/tokens";
import { renderToSvg } from "./render-to-svg.js";

/**
 * Options for `renderToPng`. Extends the SVG-render options with PNG-specific
 * knobs.
 */
export interface RenderToPngOptions extends RenderSceneToSvgOptions {
  /**
   * Uniform device-pixel scale factor. `2` gives a retina-quality PNG twice
   * the logical width / height. Default: 1.
   */
  readonly scale?: number;
  /** Background colour rendered behind the scene. Default: white. */
  readonly background?: string;
  /**
   * Fit the rendered image to this width in device pixels. Overrides
   * `scale`. Aspect ratio is preserved from the scene viewport.
   */
  readonly fitToWidth?: number;
  /** Same, but fits the height. */
  readonly fitToHeight?: number;
}

/**
 * Render a `Scene` (or its JSON document) to a PNG as a `Uint8Array`.
 *
 * Requires `@resvg/resvg-js` as a **peer dependency** — the kernel ships it
 * as optional so SVG-only consumers don't pull a ~3 MB wasm payload they
 * don't need.
 *
 * ```ts
 * import { writeFile } from "node:fs/promises";
 * import { renderToPng } from "@oh-just-another/headless";
 *
 * await writeFile("out.png", await renderToPng(scene, { scale: 2 }));
 * ```
 *
 * @throws if `@resvg/resvg-js` is not installed.
 */
export const renderToPng = async (
  scene: Scene | string,
  options: RenderToPngOptions = {},
): Promise<Uint8Array> => {
  // Optional peer-dep: import dynamically so the package itself stays
  // ESM-importable in pure-JS contexts (e.g. just for SVG).
  const resvg = await loadResvg();

  const svg = renderToSvg(scene, options);

  const fitTo: { mode: "width"; value: number } | { mode: "height"; value: number } | undefined =
    options.fitToWidth !== undefined
      ? { mode: "width", value: options.fitToWidth }
      : options.fitToHeight !== undefined
        ? { mode: "height", value: options.fitToHeight }
        : undefined;

  const resvgOptions: Record<string, unknown> = {
    fitTo: fitTo ?? { mode: "zoom", value: options.scale ?? 1 },
    background: options.background ?? UI_SURFACE.light.bgSolid,
  };

  const rendered = new resvg.Resvg(svg, resvgOptions).render();
  return rendered.asPng();
};

interface ResvgModule {
  Resvg: new (
    svg: string,
    options?: Record<string, unknown>,
  ) => { render(): { asPng(): Uint8Array } };
}

let resvgPromise: Promise<ResvgModule> | null = null;

const loadResvg = async (): Promise<ResvgModule> => {
  if (resvgPromise) return resvgPromise;
  resvgPromise = (async () => {
    try {
      // The import specifier is hidden behind a variable so Vite/ESBuild
      // don't statically resolve it. `@resvg/resvg-js` is optional.
      const specifier = "@resvg/resvg-js";
      const mod = (await import(/* @vite-ignore */ specifier)) as ResvgModule;
      if (typeof mod.Resvg !== "function") {
        throw new Error("module does not expose a Resvg class");
      }
      return mod;
    } catch (err) {
      throw new Error(
        "@oh-just-another/headless: PNG rendering requires the optional peer " +
          "dependency '@resvg/resvg-js'. Install it with `pnpm add @resvg/resvg-js`.\n" +
          `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();
  return resvgPromise;
};
