import type { FileId } from "@oh-just-another/types";

/**
 * Binary file entry stored in `Scene.files`. An `ImageElement` (or
 * other binary-bearing shape type) carries just a `fileId` and
 * resolves through this registry at render time. The actual bytes
 * live here once, regardless of how many shapes reference them.
 *
 * Storage shape is intentionally minimal:
 *
 *   • `mime` — content type ("image/png", "image/jpeg", "image/svg+xml", …)
 *   • `data` — the bytes themselves (`ArrayBuffer` so it serialises
 *     cleanly through `structuredClone`, IndexedDB, postMessage; SVG
 *     files can also use a UTF-8 encoded string round-tripped through
 *     `TextEncoder.encode().buffer`).
 *   • `name` — original filename when known, useful for downloads /
 *     export menus / accessible labels.
 *   • `createdAt` — millisecond timestamp; lets hosts age out caches
 *     and surface "added today" in file pickers.
 *
 * The serializer pipeline writes `files` to a separate sidecar so a
 * pure-text scene.json stays small; on import the host re-attaches
 * the sidecar and the shapes resolve their `fileId` lookups again.
 */
export interface BinaryFile {
  readonly id: FileId;
  readonly mime: string;
  readonly data: ArrayBuffer;
  readonly name?: string;
  readonly createdAt: number;
}

/**
 * Convenience constructor — assigns the current timestamp + a
 * sensible default `mime` of `application/octet-stream`. Hosts
 * normally pass an explicit `mime` from the source `Blob.type`.
 */
export const createBinaryFile = (
  id: FileId,
  data: ArrayBuffer,
  options: { readonly mime?: string; readonly name?: string; readonly createdAt?: number } = {},
): BinaryFile => ({
  id,
  data,
  mime: options.mime ?? "application/octet-stream",
  createdAt: options.createdAt ?? Date.now(),
  ...(options.name !== undefined ? { name: options.name } : {}),
});

/**
 * Content-sniff a media MIME from the leading magic bytes, or `null`
 * when unrecognised. Used as a fallback when a stored `BinaryFile`
 * carries a generic mime (`application/octet-stream` — e.g. a file
 * dropped with an empty `File.type` by the browser): rehydration
 * routes image-vs-video decoding by mime, so a generic one would send
 * an mp4 into the image decoder and the shape would reload blank.
 */
export const sniffBinaryFileMime = (data: ArrayBuffer): string | null => {
  const b = new Uint8Array(data, 0, Math.min(16, data.byteLength));
  const ascii = (from: number, to: number): string =>
    String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));
  if (b.length >= 12 && ascii(4, 8) === "ftyp") return "video/mp4"; // ISO-BMFF (mp4 / mov)
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return "video/webm"; // EBML (webm / mkv)
  if (b.length >= 4 && ascii(0, 4) === "OggS") return "video/ogg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && ascii(0, 4) === "GIF8") return "image/gif";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 4 && (ascii(0, 4) === "<svg" || ascii(0, 2) === "<?")) return "image/svg+xml";
  return null;
};
