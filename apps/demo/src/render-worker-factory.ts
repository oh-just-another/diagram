/**
 * Vite-aware worker factory. The `new URL("path", import.meta.url)`
 * pattern is the canonical way to ship workers with Vite — it
 * detects the constructor call, bundles the worker as its own
 * chunk, and rewrites the URL to the emitted asset at build time.
 *
 * We point at the workspace source directly (not the package's
 * `dist/`) because the dev server aliases `@oh-just-another/*` to
 * `src/index.ts` for HMR; deep imports through the alias don't
 * resolve cleanly. A relative path bypasses the alias and works
 * in both dev (vite-node) and production (vite build).
 */

export const createRenderWorker = (): Worker =>
  new Worker(
    new URL(
      "../../../packages/renderer-canvas/src/render-worker.ts",
      import.meta.url,
    ),
    { type: "module" },
  );
