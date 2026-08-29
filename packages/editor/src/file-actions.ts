import { byOrderAsc, isText, type Element, type Scene } from "@oh-just-another/scene";
import { parseScene, stringifyScene } from "@oh-just-another/serialization";
import { renderSceneToSvg } from "@oh-just-another/renderer-svg";
import { EXPORT_CONTENT_DEFAULTS, type RenderSceneOptions } from "@oh-just-another/renderer-core";
import {
  type Action,
  type ActionRegistry,
  type Editor,
  defaultActionRegistry,
} from "@oh-just-another/state";
import { exportSceneToPng, type PngExportBackground } from "./png-export.js";
import { fitViewportTo, sceneBounds, subsetScene } from "./scene-subset.js";

/**
 * File operations for the editor — Save / Open / Export / Copy-as-image —
 * wired as {@link Action}s so hosts binding the action registry (hotkeys,
 * menus, command palette) get them for free. Each action just glues the
 * existing serialization + exporter pipelines to the browser's file /
 * clipboard APIs; nothing here re-implements serialization or rendering.
 *
 * Lives in `@oh-just-another/editor` (not the lower `state` / `react-ui`
 * layers) because it needs `@oh-just-another/serialization` +
 * {@link exportSceneToPng}, which are only available here.
 */

/** Device-pixel scale for PNG export / copy. 2 = retina-quality. */
const PNG_EXPORT_SCALE = 2;

/**
 * Per-run content switches for static exports (sticky reactions / tags /
 * author). Merged over {@link EXPORT_CONTENT_DEFAULTS} by the export
 * helpers; the host's export UI feeds its checkboxes through here.
 */
export type ExportContent = RenderSceneOptions["content"];

/**
 * Host notifier for user-facing errors (bad file, empty canvas,
 * clipboard unsupported). Defaults to `window.alert`; `<Editor>` swaps
 * it for its toast via {@link setFileActionNotifier}.
 */
let notify: (message: string) => void = (message) => {
  if (typeof window !== "undefined") window.alert(message);
};

/** Override the notifier used by the file actions (host toast, etc). */
export const setFileActionNotifier = (fn: (message: string) => void): void => {
  notify = fn;
};

/**
 * Trigger a browser download of arbitrary bytes. Creates a temporary
 * `<a>`, clicks it, and revokes the object URL on the next frame so the
 * browser has time to start the download.
 */
const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  requestAnimationFrame(() => {
    URL.revokeObjectURL(url);
  });
};

/**
 * "Save as JSON" — serialises the scene through `@serialization`.
 * Binary files (image / gif / video bytes) are embedded so the saved
 * file is self-contained: without them a scene opened on another
 * machine (or after clearing the browser store) has only dangling
 * `fileId` references and every media shape renders blank.
 */
export const downloadScene = (scene: Scene): void => {
  const json = stringifyScene(scene, 2, { includeFiles: true });
  downloadBlob(new Blob([json], { type: "application/json" }), "scene.diagram.json");
};

/**
 * "Open…" — file picker that accepts `.diagram.json`, parses it, and
 * replaces the editor's scene (history reset — the default `loadScene`
 * behaviour). User cancellation = no-op; a parse failure shows a toast.
 */
export const openSceneFile = (editor: Editor): void => {
  if (typeof document === "undefined") return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const scene = parseScene(text);
        editor.loadScene(scene);
      } catch (err) {
        console.error("[diagram] failed to parse scene file:", err);
        notify("Failed to parse the file — make sure it was saved through this app's Save action.");
      }
    });
  };
  input.click();
};

/**
 * Background for "with background" exports: the scene's own paper colour
 * when set, else the host's current `--du-canvas-bg` CSS variable (falls
 * back to white). Matches what the user sees behind the shapes.
 */
const exportBackgroundColor = (scene: Scene): string =>
  scene.viewport.background ?? readCanvasBackgroundColor();

/** The host's current `--du-canvas-bg` CSS variable (falls back to white). */
const readCanvasBackgroundColor = (): string => {
  if (typeof document === "undefined") return "#ffffff";
  const probe = document.querySelector('canvas[data-layer="main"]') ?? document.body;
  const value = getComputedStyle(probe).getPropertyValue("--du-canvas-bg").trim();
  return value || "#ffffff";
};

/**
 * "Export as PNG" — renders the full scene (not just the viewport) via
 * {@link exportSceneToPng} and downloads it. `background` picks the
 * transparent / solid / solid+grid variant.
 */
export const downloadPng = async (
  editor: Editor,
  background: PngExportBackground,
  content?: ExportContent,
): Promise<void> => {
  const blob = await exportSceneToPng(editor.scene, {
    background,
    scale: PNG_EXPORT_SCALE,
    backgroundColor: exportBackgroundColor(editor.scene),
    ...(content ? { content } : {}),
  });
  if (!blob) {
    notify("Nothing to export — the canvas is empty.");
    return;
  }
  downloadBlob(blob, "scene.png");
};

/** "Export as SVG" — vector export via `renderSceneToSvg`. */
export const downloadSvg = (scene: Scene, content?: ExportContent): void => {
  const svg = renderSceneToSvg(scene, {
    content: { ...EXPORT_CONTENT_DEFAULTS, ...content },
  });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "scene.svg");
};

/** The async Clipboard API, or `undefined` in insecure contexts / old browsers. */
const clipboardApi = (): Clipboard | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.clipboard;

/** Blob writes need `clipboard.write` + `ClipboardItem`; checked BEFORE rendering. */
const canWriteClipboardBlob = (): boolean =>
  typeof clipboardApi()?.write === "function" && typeof ClipboardItem !== "undefined";

const writeClipboardBlob = async (blob: Blob, mime: string): Promise<void> => {
  const clipboard = clipboardApi();
  if (!clipboard || !canWriteClipboardBlob()) {
    notify("Copy to clipboard isn't supported in this browser.");
    return;
  }
  try {
    await clipboard.write([new ClipboardItem({ [mime]: blob })]);
  } catch (err) {
    console.error("[diagram] clipboard write failed:", err);
    notify("Couldn't copy to the clipboard.");
  }
};

const writeClipboardText = async (text: string): Promise<void> => {
  const clipboard = clipboardApi();
  if (typeof clipboard?.writeText !== "function") {
    notify("Copy to clipboard isn't supported in this browser.");
    return;
  }
  try {
    await clipboard.writeText(text);
  } catch (err) {
    console.error("[diagram] clipboard write failed:", err);
    notify("Couldn't copy to the clipboard.");
  }
};

/**
 * "Copy as image" — writes a PNG of the full scene to the system
 * clipboard via the async Clipboard API.
 */
export const copySceneAsImage = async (editor: Editor): Promise<void> => {
  if (!canWriteClipboardBlob()) {
    notify("Copy to clipboard isn't supported in this browser.");
    return;
  }
  const blob = await exportSceneToPng(editor.scene, {
    background: "color",
    scale: PNG_EXPORT_SCALE,
    backgroundColor: exportBackgroundColor(editor.scene),
  });
  if (!blob) {
    notify("Nothing to copy — the canvas is empty.");
    return;
  }
  await writeClipboardBlob(blob, "image/png");
};

/** The selection (groups with their subtrees) as a stand-alone scene, or `null` when empty. */
const selectionScene = (editor: Editor): Scene | null => {
  const ids = editor.expandSelectionWithDescendants();
  if (ids.size === 0) return null;
  return subsetScene(editor.scene, ids);
};

/** "Copy as PNG" — the selection only, transparent background, retina scale. */
export const copySelectionAsPng = async (editor: Editor): Promise<void> => {
  if (!canWriteClipboardBlob()) {
    notify("Copy to clipboard isn't supported in this browser.");
    return;
  }
  const scene = selectionScene(editor);
  if (!scene) {
    notify("Nothing to copy — select something first.");
    return;
  }
  const blob = await exportSceneToPng(scene, {
    background: "transparent",
    scale: PNG_EXPORT_SCALE,
    backgroundColor: exportBackgroundColor(editor.scene),
  });
  if (!blob) {
    notify("Nothing to copy — select something first.");
    return;
  }
  await writeClipboardBlob(blob, "image/png");
};

/**
 * SVG markup of `scene` fitted to its content (padded bbox, 1:1 scale).
 * `null` when the scene has nothing on a visible layer.
 */
export const sceneToSvgMarkup = (scene: Scene, content?: ExportContent): string | null => {
  const bbox = sceneBounds(scene);
  if (!bbox) return null;
  const fitted = fitViewportTo(scene, bbox, 1);
  return renderSceneToSvg(fitted.scene, {
    width: fitted.width,
    height: fitted.height,
    content: { ...EXPORT_CONTENT_DEFAULTS, ...content },
  });
};

/**
 * "Copy as SVG" — the selection's SVG markup as clipboard text (browsers
 * have no reliable `image/svg+xml` clipboard item; text pastes into
 * editors and design tools alike).
 */
export const copySelectionAsSvg = async (editor: Editor): Promise<void> => {
  const scene = selectionScene(editor);
  const svg = scene ? sceneToSvgMarkup(scene) : null;
  if (svg === null) {
    notify("Nothing to copy — select something first.");
    return;
  }
  await writeClipboardText(svg);
};

/**
 * Plain text of the selection: each element's text / label on its own
 * line, in z-order. Elements without text contribute nothing.
 */
export const selectionText = (editor: Editor): string => {
  const ids = editor.expandSelectionWithDescendants();
  const elements: Element[] = [];
  for (const id of ids) {
    const el = editor.scene.elements.get(id);
    if (el) elements.push(el);
  }
  return elements
    .sort(byOrderAsc)
    .map((el) => (isText(el) ? el.text : (el.label?.text ?? "")))
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .join("\n");
};

/** "Copy as text" — the selection's text lines to the clipboard. */
export const copySelectionAsText = async (editor: Editor): Promise<void> => {
  const text = selectionText(editor);
  if (text.length === 0) {
    notify("Nothing to copy — the selection has no text.");
    return;
  }
  await writeClipboardText(text);
};

/**
 * File-ops actions. `save` / `export` / `copy-as-image` are flagged
 * `viewMode` (non-mutating — fine in read-only); `open` replaces the
 * document, so it stays gated in read-only.
 */
export const fileActions: readonly Action[] = [
  {
    id: "save-scene",
    label: "Save as JSON",
    category: "other",
    viewMode: true,
    hotkey: { key: "s", meta: true },
    perform: ({ editor }) => {
      downloadScene(editor.scene);
    },
  },
  {
    id: "open-scene",
    label: "Open…",
    category: "other",
    hotkey: { key: "o", meta: true },
    perform: ({ editor }) => {
      openSceneFile(editor);
    },
  },
  {
    id: "export-png",
    label: "Export as PNG",
    category: "other",
    viewMode: true,
    hotkey: { key: "e", meta: true, shift: true },
    perform: ({ editor }) => {
      void downloadPng(editor, "color");
    },
  },
  {
    id: "copy-as-image",
    label: "Copy as image",
    category: "other",
    viewMode: true,
    // ⇧⌥C — distinct from ⌘C (copy selection) and ⌥⌘C (copy style).
    hotkey: { key: "c", shift: true, alt: true },
    perform: ({ editor }) => {
      void copySceneAsImage(editor);
    },
  },
  // Selection-scoped clipboard copies — the context menu's "Copy as …" rows.
  {
    id: "copy-as-png",
    label: "Copy as PNG",
    category: "clipboard",
    viewMode: true,
    predicate: ({ editor }) => editor.selection.size > 0,
    perform: ({ editor }) => {
      void copySelectionAsPng(editor);
    },
  },
  {
    id: "copy-as-svg",
    label: "Copy as SVG",
    category: "clipboard",
    viewMode: true,
    predicate: ({ editor }) => editor.selection.size > 0,
    perform: ({ editor }) => {
      void copySelectionAsSvg(editor);
    },
  },
  {
    id: "copy-as-text",
    label: "Copy as text",
    category: "clipboard",
    viewMode: true,
    predicate: ({ editor }) => editor.selection.size > 0,
    perform: ({ editor }) => {
      void copySelectionAsText(editor);
    },
  },
];

/**
 * Register the file-ops actions on a registry (defaults to the shared
 * {@link defaultActionRegistry}). Idempotent — safe to call on every
 * `<Editor>` mount; re-registers in place via `replace`.
 */
export const registerFileActions = (registry: ActionRegistry = defaultActionRegistry): void => {
  for (const action of fileActions) registry.replace(action);
};
