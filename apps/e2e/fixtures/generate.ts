/**
 * Serialise every golden scene to `fixtures/scenes/<id>.json` for the browser
 * consumer (the Playwright visual spec injects the JSON into the playground's
 * autosave slot). Run from the repo root:
 *
 *   pnpm tsx apps/e2e/fixtures/generate.ts
 *
 * The Node golden tests do NOT read these files — they import the factories
 * directly. This generator exists only so the browser side and the Node side
 * share one scene definition. Commit the regenerated JSON.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stringifyScene } from "@oh-just-another/serialization";
import { goldenScenes } from "./golden-scenes";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "scenes");
mkdirSync(outDir, { recursive: true });

const index: {
  id: string;
  title: string;
  dimElementIds?: readonly string[];
  dimOpacity?: number;
}[] = [];

for (const scene of goldenScenes) {
  const json = stringifyScene(scene.build());
  writeFileSync(join(outDir, `${scene.id}.json`), json, "utf8");
  index.push({
    id: scene.id,
    title: scene.title,
    ...(scene.dimElementIds ? { dimElementIds: scene.dimElementIds } : {}),
    ...(scene.dimOpacity !== undefined ? { dimOpacity: scene.dimOpacity } : {}),
  });
}

// Manifest so the browser spec can enumerate scenes without importing the
// factory module (keeps the spec free of `@oh-just-another/*` imports).
writeFileSync(join(outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");

// eslint-disable-next-line no-console
console.log(`Wrote ${goldenScenes.length} scene(s) + index.json to ${outDir}`);
