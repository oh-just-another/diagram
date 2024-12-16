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
      reject(reader.error ?? new Error(`Failed to read ${file.name}`));
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
      reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
