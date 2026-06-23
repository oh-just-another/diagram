import type { Scene } from "@oh-just-another/scene";
import { stripUndefined } from "@oh-just-another/types";
import { renderToSvg } from "@oh-just-another/headless";
import { resolveScene, sceneForFrame, sceneForRegion } from "./region.js";
import type { ExportPdfOptions, PdfPageSize } from "./options.js";

// Both deps are loaded lazily so the SVG / PNG paths don't pull pdfkit's
// considerable byte weight into bundles that don't need it.
interface PdfKitModule {
  default: new (options: Record<string, unknown>) => PdfKitDocument;
}
interface PdfKitDocument {
  info: Record<string, unknown>;
  pipe(stream: { write(chunk: Buffer): void; end(): void }): unknown;
  end(): void;
}
type SvgToPdfKit = (
  doc: PdfKitDocument,
  svg: string,
  x: number,
  y: number,
  options?: Record<string, unknown>,
) => void;

/**
 * Render a `Scene` (or JSON document) to a PDF `Uint8Array`. Vector pipeline:
 * scene → SVG (via `renderToSvg`) → embedded into a PDF page via `pdfkit` +
 * `svg-to-pdfkit`.
 *
 * Page size defaults to A4; the rendered SVG is fitted into the page's
 * content area (with `margin` applied), preserving aspect ratio.
 *
 * Requires the optional peer dependencies `pdfkit` and `svg-to-pdfkit` —
 * throws a helpful error if either is missing.
 */
export const exportPdf = async (
  scene: Scene | string,
  options: ExportPdfOptions = {},
): Promise<Uint8Array> => {
  const { PDFDocument, svgToPdfKit } = await loadPdfDeps();

  const resolved = resolveScene(scene);
  const cropped = options.frameId
    ? (sceneForFrame(resolved, options.frameId) ?? sceneForRegion(resolved, options.region))
    : sceneForRegion(resolved, options.region);

  const svgWidth = options.width ?? cropped.viewport.size.width;
  const svgHeight = options.height ?? cropped.viewport.size.height;
  const svg = renderToSvg(cropped, { width: svgWidth, height: svgHeight });

  const margin = options.margin ?? 36;
  const pageSize = options.pageSize ?? "A4";
  const orientation = options.orientation ?? "portrait";

  const doc = new PDFDocument({
    size: typeof pageSize === "string" ? pageSize : [pageSize.width, pageSize.height],
    layout: orientation,
    margin,
    info: stripUndefined({
      Title: options.title,
      Author: options.author,
      Subject: options.subject,
    }),
  });

  // Paint a filled rect under the SVG so the page isn't see-through.
  // PDFKit doesn't expose page width/height directly via `doc.page` typings, so
  // we recompute from the requested size.
  const [pageWidth, pageHeight] = pageDimensions(pageSize, orientation);
  if (options.background !== undefined) {
    const anyDoc = doc as unknown as {
      rect: (x: number, y: number, w: number, h: number) => { fill: (c: string) => void };
    };
    anyDoc.rect(0, 0, pageWidth, pageHeight).fill(options.background);
  }

  const contentWidth = pageWidth - 2 * margin;
  const contentHeight = pageHeight - 2 * margin;
  const scaleFactor = Math.min(contentWidth / svgWidth, contentHeight / svgHeight);
  const renderedWidth = svgWidth * scaleFactor;
  const renderedHeight = svgHeight * scaleFactor;
  const offsetX = margin + (contentWidth - renderedWidth) / 2;
  const offsetY = margin + (contentHeight - renderedHeight) / 2;

  svgToPdfKit(doc, svg, offsetX, offsetY, {
    width: renderedWidth,
    height: renderedHeight,
    preserveAspectRatio: "xMidYMid meet",
  });

  // PDFKit pipes to a node `Writable`. Collect chunks into a buffer and
  // resolve when the doc's `end` event fires.
  const chunks: Buffer[] = [];
  const { Writable } = await import("node:stream");
  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
  });

  return new Promise<Uint8Array>((resolve, reject) => {
    sink.on("finish", () => {
      resolve(Buffer.concat(chunks));
    });
    sink.on("error", (err) => {
      reject(err);
    });
    doc.pipe(sink);
    doc.end();
  });
};

// --- internal ---

interface PdfDeps {
  PDFDocument: PdfKitModule["default"];
  svgToPdfKit: SvgToPdfKit;
}

let pdfDepsPromise: Promise<PdfDeps> | null = null;

const loadPdfDeps = async (): Promise<PdfDeps> => {
  if (pdfDepsPromise) return pdfDepsPromise;
  pdfDepsPromise = (async () => {
    try {
      const pdfkitSpec = "pdfkit";
      const svgSpec = "svg-to-pdfkit";
      const [pdfkit, svgToPdfKitModule] = (await Promise.all([
        import(/* @vite-ignore */ pdfkitSpec),
        import(/* @vite-ignore */ svgSpec),
      ])) as [PdfKitModule, { default: SvgToPdfKit }];
      const PDFDocument = pdfkit.default;
      const svgToPdfKit = svgToPdfKitModule.default;
      if (typeof PDFDocument !== "function" || typeof svgToPdfKit !== "function") {
        throw new Error("loaded modules do not expose the expected default exports");
      }
      return { PDFDocument, svgToPdfKit };
    } catch (err) {
      throw new Error(
        "@oh-just-another/exporter: PDF rendering requires optional peer deps " +
          "'pdfkit' and 'svg-to-pdfkit'. Install them with " +
          "`pnpm add pdfkit svg-to-pdfkit`.\n" +
          `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();
  return pdfDepsPromise;
};

// PDFKit sizes in points (72 / inch).
const STANDARD_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  Letter: [612, 792],
  Legal: [612, 1008],
  Tabloid: [792, 1224],
};

const pageDimensions = (
  size: PdfPageSize,
  orientation: "portrait" | "landscape",
): [number, number] => {
  const base: [number, number] =
    typeof size === "string"
      ? (STANDARD_SIZES[size] ?? STANDARD_SIZES.A4 ?? [595.28, 841.89])
      : [size.width, size.height];
  const [w, h] = base;
  return orientation === "landscape" ? [h, w] : [w, h];
};
