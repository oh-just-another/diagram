import { readFile, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { renderToPng, renderToSvg } from "@oh-just-another/headless";

const HELP = `diagram — headless renderer for @oh-just-another/scene documents.

Usage:
  diagram render <scene.json> --out <file>   [options]
  diagram --help

Commands:
  render        Render a scene document. Output format is inferred from the
                --out extension (.svg / .png).

Options:
  --out, -o FILE        Destination file (required).
  --width N             Override the rendered width  (default: viewport.size.width or 800).
  --height N            Override the rendered height (default: viewport.size.height or 600).
  --scale N             PNG only. Uniform device-pixel multiplier. Default 1.
  --background COLOR    PNG only. Background colour. Default #ffffff.
  --help, -h            Print this help.

Examples:
  diagram render scene.json --out scene.svg
  diagram render scene.json --out scene.png --scale 2
  diagram render scene.json --out scene.png --width 1920 --background "#fafafa"
`;

interface Args {
  command: string | null;
  input: string | null;
  output: string | null;
  width: number | null;
  height: number | null;
  scale: number | null;
  background: string | null;
  help: boolean;
}

export const parseArgs = (argv: readonly string[]): Args => {
  const out: Args = {
    command: null,
    input: null,
    output: null,
    width: null,
    height: null,
    scale: null,
    background: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--out" || a === "-o") out.output = argv[++i] ?? null;
    else if (a === "--width") out.width = Number(argv[++i]);
    else if (a === "--height") out.height = Number(argv[++i]);
    else if (a === "--scale") out.scale = Number(argv[++i]);
    else if (a === "--background") out.background = argv[++i] ?? null;
    else if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
    else if (out.command === null) out.command = a;
    else if (out.input === null) out.input = a;
    else throw new Error(`Unexpected positional argument: ${a}`);
  }
  return out;
};

export const run = async (argv: readonly string[]): Promise<void> => {
  const args = parseArgs(argv);

  if (args.help || args.command === null) {
    process.stdout.write(HELP);
    return;
  }

  if (args.command !== "render") {
    throw new Error(`Unknown command: ${args.command}`);
  }

  if (!args.input) throw new Error("missing scene file (positional argument)");
  if (!args.output) throw new Error("--out is required");

  const json = await readFile(resolvePath(process.cwd(), args.input), "utf8");

  const baseOpts: { width?: number; height?: number } = {};
  if (args.width !== null && !Number.isNaN(args.width)) baseOpts.width = args.width;
  if (args.height !== null && !Number.isNaN(args.height)) baseOpts.height = args.height;

  const ext = args.output.toLowerCase().split(".").pop();
  switch (ext) {
    case "svg": {
      const svg = renderToSvg(json, baseOpts);
      await writeFile(resolvePath(process.cwd(), args.output), svg);
      process.stderr.write(`Wrote ${svg.length} bytes of SVG to ${args.output}\n`);
      return;
    }
    case "png": {
      const scale = args.scale !== null && !Number.isNaN(args.scale) ? { scale: args.scale } : {};
      const background = args.background !== null ? { background: args.background } : {};
      const pngOpts = { ...baseOpts, ...scale, ...background };
      const png = await renderToPng(json, pngOpts);
      await writeFile(resolvePath(process.cwd(), args.output), png);
      process.stderr.write(`Wrote ${png.length} bytes of PNG to ${args.output}\n`);
      return;
    }
    default:
      throw new Error(`Unsupported output extension ".${ext ?? ""}" — use .svg or .png`);
  }
};
