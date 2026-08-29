import {
  getElementWorldBounds,
  getElementsInLayer,
  getLayersInOrder,
  isSticky,
  isText,
  type Element,
  type Scene,
} from "@oh-just-another/scene";

/** Column order of {@link exportCsv}. */
export const CSV_COLUMNS = [
  "id",
  "type",
  "layer",
  "text",
  "tags",
  "author",
  "x",
  "y",
  "width",
  "height",
] as const;

/** RFC 4180 field: quoted when it holds a comma, a quote or a line break. */
const csvField = (value: string | number): string => {
  const s = typeof value === "number" ? String(value) : value;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const textOf = (el: Element): string => (isText(el) ? el.text : (el.label?.text ?? ""));

/**
 * Spreadsheet export: one row per element (bottom-to-top per layer, layers
 * in stack order) with its text / label, sticky tags and author, and the
 * world AABB. Links, files and the viewport are not included — the CSV is
 * a content listing, not a round-trippable document. RFC 4180: CRLF rows,
 * a header row, fields quoted only when needed.
 */
export const exportCsv = (scene: Scene): string => {
  const rows: string[] = [CSV_COLUMNS.join(",")];
  for (const layer of getLayersInOrder(scene)) {
    for (const el of getElementsInLayer(scene, layer.id)) {
      const b = getElementWorldBounds(el);
      const sticky = isSticky(el) ? el : null;
      rows.push(
        [
          el.id,
          el.type,
          layer.name,
          textOf(el),
          sticky?.tags?.join(";") ?? "",
          sticky?.authorName ?? "",
          Math.round(b.x),
          Math.round(b.y),
          Math.round(b.width),
          Math.round(b.height),
        ]
          .map(csvField)
          .join(","),
      );
    }
  }
  return `${rows.join("\r\n")}\r\n`;
};
