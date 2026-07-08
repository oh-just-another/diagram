import type { Scene } from "@oh-just-another/scene";
import { parseScene, stringifyScene } from "@oh-just-another/serialization";
import { renderSceneToSvg } from "@oh-just-another/renderer-svg";
import {
  type Action,
  type ActionRegistry,
  type Editor,
  defaultActionRegistry,
} from "@oh-just-another/state";
import { exportSceneToPng, type PngExportBackground } from "./png-export.js";

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
export const downloadBlob = (blob: Blob, filename: string): void => {
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

/** "Save as JSON" — serialises the scene through `@serialization`. */
export const downloadScene = (scene: Scene): void => {
  const json = stringifyScene(scene, 2);
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
 * Read the host's current `--du-canvas-bg` CSS variable (falls back to
 * white). Matches what the user sees behind the shapes on the live canvas.
 */
export const readCanvasBackgroundColor = (): string => {
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
): Promise<void> => {
  const blob = await exportSceneToPng(editor.scene, {
    background,
    scale: PNG_EXPORT_SCALE,
    backgroundColor: readCanvasBackgroundColor(),
  });
  if (!blob) {
    notify("Nothing to export — the canvas is empty.");
    return;
  }
  downloadBlob(blob, "scene.png");
};

/** "Export as SVG" — vector export via `renderSceneToSvg`. */
export const downloadSvg = (scene: Scene): void => {
  const svg = renderSceneToSvg(scene);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "scene.svg");
};

/**
 * "Copy as image" — writes a PNG of the full scene to the system
 * clipboard via the async Clipboard API. SVG-to-clipboard is a follow-up
 * (no reliable cross-browser `image/svg+xml` clipboard support today, so
 * we ship the PNG path that works everywhere the API exists).
 */
export const copySceneAsImage = async (editor: Editor): Promise<void> => {
  // `navigator.clipboard` is typed as always-present but is absent in
  // insecure contexts / older browsers, so probe it through an optional cast.
  const clipboard =
    typeof navigator === "undefined" ? undefined : (navigator.clipboard as Clipboard | undefined);
  if (typeof clipboard?.write !== "function" || typeof ClipboardItem === "undefined") {
    notify("Copy to clipboard isn't supported in this browser.");
    return;
  }
  const blob = await exportSceneToPng(editor.scene, {
    background: "color",
    scale: PNG_EXPORT_SCALE,
    backgroundColor: readCanvasBackgroundColor(),
  });
  if (!blob) {
    notify("Nothing to copy — the canvas is empty.");
    return;
  }
  try {
    await clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch (err) {
    console.error("[diagram] copy-as-image failed:", err);
    notify("Couldn't copy the image to the clipboard.");
  }
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
];

/**
 * Register the file-ops actions on a registry (defaults to the shared
 * {@link defaultActionRegistry}). Idempotent — safe to call on every
 * `<Editor>` mount; re-registers in place via `replace`.
 */
export const registerFileActions = (registry: ActionRegistry = defaultActionRegistry): void => {
  for (const action of fileActions) registry.replace(action);
};
