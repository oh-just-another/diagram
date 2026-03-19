import type { Vec2 } from "@oh-just-another/types";
import type { Editor } from "./editor.js";

/**
 * File-drop handler registry — host extension point for "user dropped a file
 * on the canvas". The kernel ships a couple of built-ins (image, scene JSON);
 * register more via `Editor.registerFileDropHandler`. The first handler whose
 * `accept()` returns true wins.
 */
export interface FileDropContext {
  readonly editor: Editor;
  /** World-space coords where the file landed. */
  readonly worldPoint: Vec2;
}

export interface FileDropHandler {
  /**
   * Stable identifier — used for `unregister`. Avoid collisions in the global
   * namespace; prefix with a domain (e.g. "image", "scene-json",
   * "host.custom").
   */
  readonly id: string;
  /**
   * Sync predicate — does this handler want the file? Receives the raw `File`
   * so it can sniff MIME or extension. Should be cheap; heavy work goes inside
   * `handle`.
   */
  accept(file: File): boolean;
  /**
   * Do the actual work. Async — may read the file, decode it, push scene
   * patches, etc. Reject with a thrown error or a rejected promise to surface
   * failures to the host's toast / error UI.
   */
  handle(file: File, ctx: FileDropContext): Promise<void> | void;
}

/**
 * In-order registry of file-drop handlers. Dispatch picks the first `accept`
 * match and calls `handle`. Order of registration matters — more specific
 * handlers should register first.
 */
export class FileDropRegistry {
  private readonly entries: FileDropHandler[] = [];

  register(handler: FileDropHandler): void {
    // Replace existing entry with the same id so re-registration is idempotent
    // (mirrors ActionRegistry.replace semantics).
    const idx = this.entries.findIndex((h) => h.id === handler.id);
    if (idx !== -1) {
      this.entries[idx] = handler;
      return;
    }
    this.entries.push(handler);
  }

  unregister(id: string): void {
    const idx = this.entries.findIndex((h) => h.id === id);
    if (idx !== -1) this.entries.splice(idx, 1);
  }

  getAll(): readonly FileDropHandler[] {
    return this.entries;
  }

  /**
   * Run the first matching handler for the file. Returns `true` if a handler
   * accepted, `false` otherwise — callers use that to decide whether to show
   * an "unsupported file" toast.
   */
  async dispatch(file: File, ctx: FileDropContext): Promise<boolean> {
    for (const handler of this.entries) {
      if (!handler.accept(file)) continue;
      await handler.handle(file, ctx);
      return true;
    }
    return false;
  }
}

/** Accepted image MIME types. */
export const IMAGE_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/x-icon",
  "image/avif",
  "image/jfif",
];

/**
 * Accepted video MIME types — dropped inline videos render as animated shapes
 * via `<video>`. Codec support depends on the host browser; we accept the
 * wrappers and let the browser refuse on decode.
 */
export const VIDEO_MIME_TYPES: readonly string[] = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];

/** True when the file MIME (or extension) indicates a video. */
export const isVideoFile = (file: File): boolean => {
  if (file.type.startsWith("video/")) return true;
  const ext = file.name.toLowerCase().split(".").pop();
  return ext === "mp4" || ext === "webm" || ext === "ogv" || ext === "mov";
};

/** True if the file's declared MIME (or extension fallback) is in IMAGE_MIME_TYPES. */
export const isImageFile = (file: File): boolean => {
  if (file.type && IMAGE_MIME_TYPES.includes(file.type)) return true;
  // Some browsers omit `file.type`; fall back to extension sniffing.
  const ext = file.name.toLowerCase().split(".").pop();
  if (!ext) return false;
  const byExt: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    jfif: "image/jfif",
    svg: "image/svg+xml",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    avif: "image/avif",
  };
  return byExt[ext] !== undefined;
};

/** True if the file is a scene-document JSON (best-effort via extension). */
export const isSceneJsonFile = (file: File): boolean => {
  if (file.type === "application/json") return true;
  return file.name.toLowerCase().endsWith(".json");
};

/** Read a file as a data URL (Promise wrapper around FileReader). */
export const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error(`Unexpected FileReader result type for ${file.name}`));
    };
    reader.onerror = () =>
      { reject(reader.error ?? new Error(`Failed to read ${file.name}`)); };
    reader.readAsDataURL(file);
  });

/** Read a file as plain text. */
export const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error(`Unexpected FileReader result type for ${file.name}`));
    };
    reader.onerror = () =>
      { reject(reader.error ?? new Error(`Failed to read ${file.name}`)); };
    reader.readAsText(file);
  });

/**
 * Recursive walker for `DataTransfer` that descends into directories via the
 * non-standard but universally-supported `webkitGetAsEntry()` API. Yields
 * every leaf `File` once. Hosts feed each yielded file into
 * `editor.dispatchFileDrop(...)`.
 *
 * Two failure modes are handled:
 *   • Browsers without `webkitGetAsEntry` (older Safari) — falls back to the
 *     flat `dataTransfer.files` list.
 *   • Async `entry.file()` / `reader.readEntries()` errors — caught and
 *     reported via the `onError` callback so one bad sub-folder doesn't kill
 *     the whole drop.
 *
 * Implemented as an `AsyncGenerator` so callers can `for await` and start
 * processing the first file before the last is found — important for big
 * folders where reading every file up-front would block for seconds.
 */
export interface WalkOptions {
  /**
   * Skip any directory whose name matches this predicate. Default: skips
   * `.git`, `node_modules`, `__MACOSX`, `.DS_Store`, and any name starting
   * with a dot (hidden).
   */
  readonly skipDirectory?: (name: string) => boolean;
  /** Max recursion depth. Default 32 — guards against symlink loops. */
  readonly maxDepth?: number;
  /** Per-entry error callback. Without it, errors are swallowed. */
  readonly onError?: (path: string, error: unknown) => void;
}

const DEFAULT_SKIP = (name: string): boolean =>
  name === ".git" ||
  name === "node_modules" ||
  name === "__MACOSX" ||
  name === ".DS_Store" ||
  name.startsWith(".");

interface FileSystemEntryLike {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  file?(success: (file: File) => void, error: (err: unknown) => void): void;
  createReader?(): FileSystemDirectoryReaderLike;
}

interface FileSystemDirectoryReaderLike {
  readEntries(
    success: (entries: FileSystemEntryLike[]) => void,
    error: (err: unknown) => void,
  ): void;
}

interface DataTransferItemLike {
  kind: string;
  webkitGetAsEntry?(): FileSystemEntryLike | null;
}

export const walkDataTransfer = async function* (
  dt: DataTransfer,
  options: WalkOptions = {},
): AsyncGenerator<File, void, void> {
  const skip = options.skipDirectory ?? DEFAULT_SKIP;
  const maxDepth = options.maxDepth ?? 32;
  // `DataTransfer.items` is absent in some browsers; the cast to a
  // possibly-null ArrayLike keeps the runtime guards meaningful.
  const items = dt.items as unknown as ArrayLike<DataTransferItemLike> | null;

  // Fast path: no items API or no webkitGetAsEntry — yield the flat files
  // list and we're done.
  const hasEntryApi =
    items !== null && items.length > 0 && typeof items[0]?.webkitGetAsEntry === "function";
  if (items === null || !hasEntryApi) {
    for (const file of Array.from(dt.files)) yield file;
    return;
  }

  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (!entry) continue;
    yield* walkEntry(entry, "", 0, skip, maxDepth, options.onError);
  }
};

async function* walkEntry(
  entry: FileSystemEntryLike,
  prefix: string,
  depth: number,
  skip: (name: string) => boolean,
  maxDepth: number,
  onError: ((path: string, err: unknown) => void) | undefined,
): AsyncGenerator<File, void, void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    try {
      const file = await new Promise<File>((resolve, reject) => {
        entry.file?.(resolve, reject);
      });
      yield file;
    } catch (err) {
      onError?.(path, err);
    }
    return;
  }

  if (!entry.isDirectory) return;
  if (skip(entry.name)) return;
  if (depth >= maxDepth) {
    onError?.(path, new Error(`Folder depth exceeds ${maxDepth}`));
    return;
  }

  const reader = entry.createReader?.();
  if (!reader) return;

  // `readEntries` returns at most ~100 at a time on Chrome; loop until an
  // empty array signals "done".
  for (;;) {
    let batch: FileSystemEntryLike[];
    try {
      batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
    } catch (err) {
      onError?.(path, err);
      return;
    }
    if (batch.length === 0) return;
    for (const child of batch) {
      yield* walkEntry(child, path, depth + 1, skip, maxDepth, onError);
    }
  }
}
