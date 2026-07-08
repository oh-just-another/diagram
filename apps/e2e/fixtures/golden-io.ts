/**
 * Baseline I/O for the Node golden-scene harness. Dependency-free (node
 * builtins only) so both `renderer-svg` (SVG-only) and `headless` (SVG + PNG)
 * tests can share it without pulling extra deps into either package.
 *
 * Baselines live next to the scenes under `fixtures/golden/`. Paths resolve
 * relative to THIS file (via `import.meta.url`) so the tests work regardless of
 * the vitest cwd.
 *
 * Update mode: run the golden tests with `UPDATE_GOLDEN=1` to (re)write every
 * baseline instead of comparing. Commit the result.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Directory holding the serialized `<id>.json` scenes (browser consumer). */
export const scenesDir = join(here, "scenes");
/** Directory holding the committed SVG baselines. */
export const svgGoldenDir = join(here, "golden", "svg");
/** Directory holding the committed PNG baselines. */
export const pngGoldenDir = join(here, "golden", "png");

/** True when the harness should (re)write baselines instead of comparing. */
export const shouldUpdateGolden = (): boolean =>
  process.env.UPDATE_GOLDEN === "1" || process.env.UPDATE_GOLDEN === "true";

const ensureDir = (dir: string): void => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

/** Read a UTF-8 baseline, or `null` when it does not exist yet. */
export const readTextBaseline = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, "utf8") : null;

/** Write a UTF-8 baseline, creating parent dirs as needed. */
export const writeTextBaseline = (path: string, content: string): void => {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
};

/** Read a binary baseline, or `null` when it does not exist yet. */
export const readBinaryBaseline = (path: string): Buffer | null =>
  existsSync(path) ? readFileSync(path) : null;

/** Write a binary baseline, creating parent dirs as needed. */
export const writeBinaryBaseline = (path: string, content: Uint8Array): void => {
  ensureDir(dirname(path));
  writeFileSync(path, content);
};
