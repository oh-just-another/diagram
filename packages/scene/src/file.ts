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
