import { readFile, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { renderToPng, renderToSvg } from "@oh-just-another/headless";
import { exportPdf, exportPng, type ExportRegion } from "@oh-just-another/exporter";
import { importDot, importDrawio, importMermaid } from "@oh-just-another/importers";
import { stringifyScene } from "@oh-just-another/serialization";
import { stripUndefined } from "@oh-just-another/types";

const HELP = `diagram — headless renderer for @oh-just-another/scene documents.

Usage:
  diagram render <scene.json> --out <file>   [options]
  diagram export <scene.json> --out <file>   [options]
  diagram import <source>     --out <file>   [--from mermaid|dot|drawio]
  diagram --help

Commands:
  render        Quick render via @headless. Format inferred from --out (.svg / .png).
  export        Hi-res / cropped / DPI-aware export via @exporter (.png / .pdf).
  import        Convert Mermaid / Graphviz dot / drawio XML into a scene.json.

Common options:
  --out, -o FILE        Destination file (required).
  --width N             Override the rendered width  (default: viewport.size.width or 800).
  --height N            Override the rendered height (default: viewport.size.height or 600).
  --scale N             Device-pixel multiplier (PNG). Default 1.
  --background COLOR    Background colour. Default #ffffff for PNG.
  --help, -h            Print this help.

Export-only options:
  --crop X,Y,W,H        Crop rectangle in world coordinates.
  --dpi N               PNG: embed pHYs chunk so document apps print at this DPI.
  --page SIZE           PDF: A4 (default) / A5 / Letter / Legal / Tabloid, or WxH in points.
  --orientation MODE    PDF: portrait (default) / landscape.
  --margin N            PDF: page margin in points (1pt = 1/72in). Default 36.
  --title S             PDF: document title metadata.
  --author S            PDF: document author metadata.

Import-only options:
  --from FORMAT         Source format: mermaid / dot / drawio. Inferred from
                        the source extension (.mmd/.mermaid → mermaid,
                        .dot/.gv → dot, .drawio/.xml → drawio) when omitted.

Examples:
  diagram render scene.json --out scene.svg
  diagram render scene.json --out scene.png --scale 2
  diagram export scene.json --out scene.pdf --page Letter --orientation landscape
  diagram export scene.json --out cropped.png --crop 0,0,400,300 --dpi 300
  diagram import flow.mmd   --out scene.json
  diagram import g.dot      --out scene.json --from dot
`;

interface Args {
  command: string | null;
  input: string | null;
  output: string | null;
  width: number | null;
  height: number | null;
  scale: number | null;
  background: string | null;
  crop: ExportRegion | null;
  dpi: number | null;
  page: string | null;
  orientation: "portrait" | "landscape" | null;
  margin: number | null;
  title: string | null;
  author: string | null;
  from: "mermaid" | "dot" | "drawio" | null;
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
    crop: null,
    dpi: null,
    page: null,
    orientation: null,
    margin: null,
    title: null,
    author: null,
    from: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--out" || a === "-o") out.output = argv[++i] ?? null;
    else if (a === "--width") out.width = Number(argv[++i]);
    else if (a === "--height") out.height = Number(argv[++i]);
    else if (a === "--scale") out.scale = Number(argv[++i]);
    else if (a === "--background") out.background = argv[++i] ?? null;
    else if (a === "--crop") out.crop = parseCrop(argv[++i] ?? "");
    else if (a === "--dpi") out.dpi = Number(argv[++i]);
    else if (a === "--page") out.page = argv[++i] ?? null;
    else if (a === "--orientation") {
      const v = argv[++i];
      if (v !== "portrait" && v !== "landscape") {
        throw new Error("--orientation must be portrait or landscape");
      }
      out.orientation = v;
    } else if (a === "--margin") out.margin = Number(argv[++i]);
    else if (a === "--title") out.title = argv[++i] ?? null;
    else if (a === "--author") out.author = argv[++i] ?? null;
    else if (a === "--from") {
      const v = argv[++i];
      if (v !== "mermaid" && v !== "dot" && v !== "drawio") {
        throw new Error("--from must be mermaid / dot / drawio");
      }
      out.from = v;
    } else if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
    else if (out.command === null) out.command = a;
    else if (out.input === null) out.input = a;
    else throw new Error(`Unexpected positional argument: ${a}`);
  }
  return out;
};

const parseCrop = (raw: string): ExportRegion => {
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error("--crop expects X,Y,W,H (e.g. 0,0,400,300)");
  }
  const req = (v: number | undefined): number => {
    if (v === undefined) throw new Error("apps/cli: index out of range");
    return v;
  };
  return {
    x: req(parts[0]),
    y: req(parts[1]),
    width: req(parts[2]),
    height: req(parts[3]),
  };
};

export const run = async (argv: readonly string[]): Promise<void> => {
  const args = parseArgs(argv);

  if (args.help || args.command === null) {
    process.stdout.write(HELP);
    return;
  }

  if (args.command === "render") return runRender(args);
  if (args.command === "export") return runExport(args);
  if (args.command === "import") return runImport(args);
  throw new Error(`Unknown command: ${args.command}`);
};

const runImport = async (args: Args): Promise<void> => {
  if (!args.input) throw new Error("missing source file (positional argument)");
  if (!args.output) throw new Error("--out is required");

  const source = await readFile(resolvePath(process.cwd(), args.input), "utf8");
  const format = args.from ?? inferImportFormat(args.input);
  if (!format) {
    throw new Error(
      `Could not infer source format from "${args.input}" — pass --from mermaid|dot|drawio`,
    );
  }

  const scene =
    format === "mermaid"
      ? importMermaid(source)
      : format === "dot"
        ? importDot(source)
        : importDrawio(source);

  const json = stringifyScene(scene, 2);
  await writeFile(resolvePath(process.cwd(), args.output), json);
  process.stderr.write(
    `Imported ${scene.elements.size} elements / ${scene.links.size} links to ${args.output}\n`,
  );
};

const inferImportFormat = (path: string): "mermaid" | "dot" | "drawio" | null => {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (ext === "mmd" || ext === "mermaid") return "mermaid";
  if (ext === "dot" || ext === "gv") return "dot";
  if (ext === "drawio" || ext === "xml") return "drawio";
  return null;
};

const runRender = async (args: Args): Promise<void> => {
  if (!args.input) throw new Error("missing scene file (positional argument)");
  if (!args.output) throw new Error("--out is required");

  const json = await readFile(resolvePath(process.cwd(), args.input), "utf8");
  const baseOpts: { width?: number; height?: number } = {};
  if (args.width !== null && !Number.isNaN(args.width)) baseOpts.width = args.width;
  if (args.height !== null && !Number.isNaN(args.height)) baseOpts.height = args.height;

  const ext = extOf(args.output);
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
      const png = await renderToPng(json, { ...baseOpts, ...scale, ...background });
      await writeFile(resolvePath(process.cwd(), args.output), png);
      process.stderr.write(`Wrote ${png.length} bytes of PNG to ${args.output}\n`);
      return;
    }
    default:
      throw new Error(`Unsupported render extension ".${ext ?? ""}" — use .svg or .png`);
  }
};

const runExport = async (args: Args): Promise<void> => {
  if (!args.input) throw new Error("missing scene file (positional argument)");
  if (!args.output) throw new Error("--out is required");

  const json = await readFile(resolvePath(process.cwd(), args.input), "utf8");

  const ext = extOf(args.output);
  switch (ext) {
    case "png": {
      const opts = stripUndefined({
        width: numOrUndef(args.width),
        height: numOrUndef(args.height),
        scale: numOrUndef(args.scale),
        background: args.background ?? undefined,
        region: args.crop ?? undefined,
        dpi: numOrUndef(args.dpi),
      }) as Parameters<typeof exportPng>[1];
      const png = await exportPng(json, opts);
      await writeFile(resolvePath(process.cwd(), args.output), png);
      process.stderr.write(`Wrote ${png.length} bytes of PNG to ${args.output}\n`);
      return;
    }
    case "pdf": {
      const opts = stripUndefined({
        width: numOrUndef(args.width),
        height: numOrUndef(args.height),
        background: args.background ?? undefined,
        region: args.crop ?? undefined,
        pageSize: parsePageSize(args.page),
        orientation: args.orientation ?? undefined,
        margin: numOrUndef(args.margin),
        title: args.title ?? undefined,
        author: args.author ?? undefined,
      }) as Parameters<typeof exportPdf>[1];
      const pdf = await exportPdf(json, opts);
      await writeFile(resolvePath(process.cwd(), args.output), pdf);
      process.stderr.write(`Wrote ${pdf.length} bytes of PDF to ${args.output}\n`);
      return;
    }
    default:
      throw new Error(`Unsupported export extension ".${ext ?? ""}" — use .png or .pdf`);
  }
};

const extOf = (path: string): string | undefined => path.toLowerCase().split(".").pop();

const numOrUndef = (n: number | null): number | undefined =>
  n !== null && !Number.isNaN(n) ? n : undefined;

const parsePageSize = (
  raw: string | null,
): "A4" | "A5" | "Letter" | "Legal" | "Tabloid" | { width: number; height: number } | undefined => {
  if (raw === null) return undefined;
  if (["A4", "A5", "Letter", "Legal", "Tabloid"].includes(raw)) {
    return raw as "A4" | "A5" | "Letter" | "Legal" | "Tabloid";
  }
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(raw);
  if (!m) throw new Error(`--page expects A4/A5/Letter/Legal/Tabloid or WxH (got "${raw}")`);
  return { width: Number(m[1]), height: Number(m[2]) };
};
