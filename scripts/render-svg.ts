#!/usr/bin/env -S pnpm exec vite-node
/**
 * Headless SVG renderer.
 *
 * Reads a scene JSON file and prints the rendered SVG to stdout (or writes
 * it to --out). Verifies the SVG backend without spinning up a browser.
 *
 * Usage:
 *   pnpm render:svg <scene.json> [--out scene.svg] [--width N] [--height N]
 *   pnpm render:svg --help
 *
 * The script is executed via `vite-node`, which loads workspace packages
 * from their `src/` directories — no `pnpm build` needed.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { parseScene } from "@oh-just-another/serialization";
import { renderSceneToSvg } from "@oh-just-another/renderer-svg";

const HELP = `Usage: pnpm render:svg <scene.json> [--out file.svg] [--width N] [--height N]

  <scene.json>       Path to a scene document (as produced by demo's Save button).
  --out, -o FILE     Write the SVG to FILE (default: stdout).
  --width N          Override the SVG width  (default: scene.viewport.size.width or 800).
  --height N         Override the SVG height (default: scene.viewport.size.height or 600).
  --help, -h         Print this help.`;

interface Args {
  input: string | null;
  output: string | null;
  width: number | null;
  height: number | null;
  help: boolean;
}

const parseArgs = (argv: readonly string[]): Args => {
  const out: Args = { input: null, output: null, width: null, height: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--out" || a === "-o") out.output = argv[++i] ?? null;
    else if (a === "--width") out.width = Number(argv[++i]);
    else if (a === "--height") out.height = Number(argv[++i]);
    else if (!a.startsWith("-")) out.input = a;
    else throw new Error(`Unknown option: ${a}`);
  }
  return out;
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    process.stdout.write(HELP + "\n");
    process.exit(args.help ? 0 : 1);
  }

  const raw = await readFile(resolvePath(process.cwd(), args.input), "utf8");
  const scene = parseScene(raw);

  const options: { width?: number; height?: number } = {};
  if (args.width !== null && !Number.isNaN(args.width)) options.width = args.width;
  if (args.height !== null && !Number.isNaN(args.height)) options.height = args.height;
  if (options.width === undefined && scene.viewport.size.width === 0) options.width = 800;
  if (options.height === undefined && scene.viewport.size.height === 0) options.height = 600;

  const svg = renderSceneToSvg(scene, options);

  if (args.output) {
    await writeFile(resolvePath(process.cwd(), args.output), svg);
    process.stderr.write(
      `Wrote ${svg.length} bytes of SVG to ${args.output} (${scene.shapes.size} shapes)\n`,
    );
  } else {
    process.stdout.write(svg);
  }
};

main().catch((err: unknown) => {
  process.stderr.write(`render-svg: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
