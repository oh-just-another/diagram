import { fileId as castFileId, type FileId } from "@oh-just-another/types";
import { createBinaryFile, type BinaryFile, type Scene } from "@oh-just-another/scene";

/**
 * Sidecar serializer for `Scene.files`. The JSON document keeps every
 * `BinaryFile` as base64-encoded `data`. Pair with `parseFiles(...)` to
 * round-trip.
 *
 * Wire format (JSON):
 * ```
 * { version: 1, files: [ { id, mime, name?, createdAt, data } ] }
 * ```
 *
 * `data` is base64 (no data-URL prefix) so the payload is plain JSON,
 * which fits any HTTP/SSE/WebSocket transport.
 */

export interface SerializedFilesDocument {
  readonly version: 1;
  readonly files: readonly {
    readonly id: string;
    readonly mime: string;
    readonly name?: string;
    readonly createdAt: number;
    /** base64-encoded bytes (no data-URL prefix). */
    readonly data: string;
  }[];
}

export const serializeFiles = (scene: Scene): SerializedFilesDocument => {
  const files: SerializedFilesDocument["files"][number][] = [];
  for (const file of scene.files.values()) {
    files.push({
      id: file.id,
      mime: file.mime,
      createdAt: file.createdAt,
      data: arrayBufferToBase64(file.data),
      ...(file.name !== undefined ? { name: file.name } : {}),
    });
  }
  return { version: 1, files };
};

export const stringifyFiles = (scene: Scene, indent: number | null = null): string =>
  indent === null
    ? JSON.stringify(serializeFiles(scene))
    : JSON.stringify(serializeFiles(scene), null, indent);

export const parseFiles = (
  json: string | SerializedFilesDocument,
): ReadonlyMap<FileId, BinaryFile> => {
  const doc: unknown = typeof json === "string" ? JSON.parse(json) : json;
  if (
    typeof doc !== "object" ||
    doc === null ||
    (doc as { version?: unknown }).version !== 1 ||
    !Array.isArray((doc as { files?: unknown }).files)
  ) {
    throw new Error("parseFiles: unsupported document version or shape");
  }
  const out = new Map<FileId, BinaryFile>();
  for (const entry of (doc as SerializedFilesDocument).files) {
    const id = castFileId(entry.id);
    out.set(
      id,
      createBinaryFile(id, base64ToArrayBuffer(entry.data), {
        mime: entry.mime,
        createdAt: entry.createdAt,
        ...(entry.name !== undefined ? { name: entry.name } : {}),
      }),
    );
  }
  return out;
};

// --- base64 helpers ---
// Avoids `Buffer` so the package runs in browsers without a polyfill;
// `btoa`/`atob` operate on binary strings which keeps the
// implementation portable.

const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let binary = "";
  // Chunk to avoid `Maximum call stack size exceeded` on big files.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  if (typeof btoa === "function") return btoa(binary);
  // Node fallback — Buffer is always available there.
  return Buffer.from(binary, "binary").toString("base64");
};

const base64ToArrayBuffer = (b64: string): ArrayBuffer => {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  const buf = Buffer.from(b64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
