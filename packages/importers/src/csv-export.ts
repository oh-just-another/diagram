import {
  getElementWorldBounds,
  getElementsInLayer,
  getLayersInOrder,
  isImage,
  isSticky,
  isText,
  byOrderAsc,
  type Element,
  type Link,
  type LinkEndpoint,
  type Scene,
} from "@oh-just-another/scene";
import type { ElementId } from "@oh-just-another/types";

/**
 * Column order of {@link exportCsv}. Element rows leave `from` / `to` empty;
 * link rows (`type = link`) leave the geometry and sticky columns empty.
 */
export const CSV_COLUMNS = [
  "id",
  "type",
  "layer",
  "parent",
  "text",
  "tags",
  "author",
  "reactions",
  "comments",
  "link",
  "fill",
  "stroke",
  "locked",
  "hidden",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "from",
  "to",
] as const;

/** Separator inside a multi-value cell (tags, reactions). */
const CSV_LIST_SEPARATOR = ";";

/** RFC 4180 field: quoted when it holds a comma, a quote or a line break. */
const csvField = (value: string | number | boolean): string => {
  const s = typeof value === "string" ? value : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const textOf = (el: Element): string => {
  if (isText(el)) return el.text;
  if (isImage(el)) return el.alt ?? "";
  return el.label?.text ?? "";
};

const endpointId = (end: LinkEndpoint): string => (end.kind === "point" ? "" : end.elementId);

/** `open`, `resolved` or `open+resolved` comment-thread counts per element. */
const commentCounts = (scene: Scene): ReadonlyMap<ElementId, string> => {
  const open = new Map<ElementId, number>();
  const resolved = new Map<ElementId, number>();
  for (const a of scene.annotations.values()) {
    if (a.elementId === null) continue;
    const bucket = a.resolved ? resolved : open;
    bucket.set(a.elementId, (bucket.get(a.elementId) ?? 0) + a.thread.length);
  }
  const out = new Map<ElementId, string>();
  for (const id of new Set([...open.keys(), ...resolved.keys()])) {
    const parts: string[] = [];
    const o = open.get(id) ?? 0;
    const r = resolved.get(id) ?? 0;
    if (o > 0) parts.push(`${String(o)} open`);
    if (r > 0) parts.push(`${String(r)} resolved`);
    out.set(id, parts.join(CSV_LIST_SEPARATOR));
  }
  return out;
};

const elementRow = (el: Element, layerName: string, comments: string): string => {
  const b = getElementWorldBounds(el);
  const sticky = isSticky(el) ? el : null;
  const reactions =
    sticky?.reactions
      ?.map((r) => `${r.glyph}:${String(r.users.length)}`)
      .join(CSV_LIST_SEPARATOR) ?? "";
  return [
    el.id,
    el.type,
    layerName,
    el.parentId ?? el.frameId ?? "",
    textOf(el),
    sticky?.tags?.join(CSV_LIST_SEPARATOR) ?? "",
    sticky?.authorName ?? "",
    reactions,
    comments,
    el.href ?? "",
    el.style.fill ?? "",
    el.style.stroke ?? "",
    el.locked === true,
    el.hidden === true,
    Math.round(b.x),
    Math.round(b.y),
    Math.round(b.width),
    Math.round(b.height),
    Math.round(el.rotation),
    "",
    "",
  ]
    .map(csvField)
    .join(",");
};

const linkRow = (link: Link, layerName: string): string =>
  [
    link.id,
    "link",
    layerName,
    "",
    link.label?.text ?? "",
    "",
    "",
    "",
    "",
    "",
    "",
    link.style.stroke ?? "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    endpointId(link.from),
    endpointId(link.to),
  ]
    .map(csvField)
    .join(",");

/**
 * Spreadsheet export — a content listing, not a round-trippable document.
 * One row per element (bottom-to-top per layer, layers in stack order):
 * text / label (image alt for images), group or frame parent, sticky tags,
 * author and reactions (`glyph:count`), comment-thread counts, hyperlink,
 * fill / stroke, locked / hidden flags and the world AABB + rotation. Then
 * one row per link of the layer (`type = link`) with its label, stroke and
 * the ids it connects (`from` / `to`, empty for a free point). Files and the
 * viewport are not included. RFC 4180: CRLF rows, a header row, fields
 * quoted only when needed.
 */
export const exportCsv = (scene: Scene): string => {
  const rows: string[] = [CSV_COLUMNS.join(",")];
  const comments = commentCounts(scene);
  for (const layer of getLayersInOrder(scene)) {
    for (const el of getElementsInLayer(scene, layer.id)) {
      rows.push(elementRow(el, layer.name, comments.get(el.id) ?? ""));
    }
    const links = [...scene.links.values()].filter((l) => l.layerId === layer.id).sort(byOrderAsc);
    for (const link of links) rows.push(linkRow(link, layer.name));
  }
  return `${rows.join("\r\n")}\r\n`;
};
