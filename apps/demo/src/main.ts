import { describe as describePatch } from "@oh-just-another/history";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { Editor, type Mode } from "@oh-just-another/state";
import { DEFAULT_LAYER_ID, orderForTop } from "@oh-just-another/scene";
import { parseScene, stringifyScene } from "@oh-just-another/serialization";
import { shapeId } from "@oh-just-another/types";
import {
  defaultRegistry,
  installBuiltinTemplates,
  loadTemplateLibrary,
  type Category,
  type Template,
} from "@oh-just-another/templates";
import { CUSTOM_TEMPLATES } from "./custom-templates";
import { buildSampleScene } from "./scene-builder";

// --- Bootstrap renderers + templates ---

installBuiltinRenderers();
installBuiltinTemplates(); // basic + flowchart
loadTemplateLibrary(CUSTOM_TEMPLATES, defaultRegistry); // custom — programmatic JSON import

// --- DOM lookups ---

const host = document.getElementById("stage");
if (!host) throw new Error("#stage element not found");
const toolbar = document.getElementById("toolbar");
const undoBtn = document.getElementById("btn-undo") as HTMLButtonElement | null;
const redoBtn = document.getElementById("btn-redo") as HTMLButtonElement | null;
const historyList = document.getElementById("history-list");
const historyCounter = document.getElementById("history-counter");
const paletteTabs = document.getElementById("palette-tabs");
const paletteItems = document.getElementById("palette-items");
if (
  !toolbar ||
  !undoBtn ||
  !redoBtn ||
  !historyList ||
  !historyCounter ||
  !paletteTabs ||
  !paletteItems
) {
  throw new Error("missing required DOM nodes");
}

// --- Editor ---

const { width, height } = host.getBoundingClientRect();
const layered = new LayeredCanvas(host, width, height);
const editor = new Editor({
  host,
  mainTarget: layered.get("main"),
  overlayTarget: layered.get("overlay"),
  initialScene: buildSampleScene(width, height),
  initialMode: "select",
});

// --- Utility ---

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Mode buttons + history actions ---

const modeButtons = toolbar.querySelectorAll<HTMLButtonElement>("button[data-mode]");
const setActiveMode = (mode: Mode) => {
  for (const btn of modeButtons) btn.classList.toggle("active", btn.dataset.mode === mode);
};

toolbar.addEventListener("click", (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const mode = target.dataset.mode as Mode | undefined;
  if (mode) {
    editor.setMode(mode);
    setActiveMode(mode);
    return;
  }
  const action = target.dataset.action;
  if (action === "undo") editor.undo();
  if (action === "redo") editor.redo();
  if (action === "save") saveToFile();
  if (action === "load") fileInput?.click();
});

// --- Save / Load ---

const STORAGE_KEY = "oh-just-another-demo-scene-v1";
const fileInput = document.getElementById("file-input") as HTMLInputElement | null;

const saveToFile = () => {
  const json = stringifyScene(editor.scene, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.download = `scene-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void file
    .text()
    .then((text) => {
      try {
        editor.loadScene(parseScene(text));
      } catch (err) {
        console.error("[demo] failed to load scene:", err);
        window.alert(`Failed to load scene: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
    .finally(() => {
      fileInput.value = ""; // allow re-selecting the same file
    });
});

// Autosave to localStorage on every editor change. Restore on startup if a
// previous snapshot exists and is parseable.
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) editor.loadScene(parseScene(saved));
} catch (err) {
  console.warn("[demo] stored scene was unparseable, starting fresh", err);
  localStorage.removeItem(STORAGE_KEY);
}
editor.subscribe(() => {
  try {
    localStorage.setItem(STORAGE_KEY, stringifyScene(editor.scene));
  } catch {
    // Quota exceeded or other storage error — silently drop the autosave.
  }
});

// --- Palette ---

const TAB_ORDER: readonly Category[] = ["basic", "flowchart", "custom"];

let activeCategory: Category = "basic";

const renderPaletteTabs = () => {
  const present = new Set(defaultRegistry.categories());
  paletteTabs.innerHTML = "";
  for (const cat of TAB_ORDER) {
    if (!present.has(cat)) continue;
    const btn = document.createElement("button");
    btn.textContent = cat;
    btn.classList.toggle("active", cat === activeCategory);
    btn.addEventListener("click", () => {
      activeCategory = cat;
      renderPaletteTabs();
      renderPaletteItems();
    });
    paletteTabs.appendChild(btn);
  }
};

const renderPaletteItems = () => {
  paletteItems.innerHTML = "";
  for (const template of defaultRegistry.byCategory(activeCategory)) {
    paletteItems.appendChild(buildPaletteItem(template));
  }
};

const buildPaletteItem = (template: Template): HTMLElement => {
  const el = document.createElement("div");
  el.className = "palette-item";
  el.draggable = true;
  el.title = template.name;
  el.innerHTML = `${template.icon}<span class="name">${escapeHtml(template.name)}</span>`;
  el.addEventListener("dragstart", (ev) => {
    if (!ev.dataTransfer) return;
    ev.dataTransfer.setData("application/x-template-id", template.id);
    ev.dataTransfer.effectAllowed = "copy";
  });
  return el;
};

renderPaletteTabs();
renderPaletteItems();

// --- Drag from palette → drop on stage ---

let createCounter = 0;

host.addEventListener("dragenter", (ev) => {
  if (ev.dataTransfer?.types.includes("application/x-template-id")) {
    ev.preventDefault();
    host.classList.add("drop-target");
  }
});

host.addEventListener("dragover", (ev) => {
  if (ev.dataTransfer?.types.includes("application/x-template-id")) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
  }
});

host.addEventListener("dragleave", (ev) => {
  // The dragleave fires for child elements too — only clear the highlight
  // when the pointer actually left the stage.
  if (!host.contains(ev.relatedTarget as Node | null)) {
    host.classList.remove("drop-target");
  }
});

host.addEventListener("drop", (ev) => {
  ev.preventDefault();
  host.classList.remove("drop-target");
  const templateId = ev.dataTransfer?.getData("application/x-template-id");
  if (!templateId) return;
  const template = defaultRegistry.get(templateId);
  if (!template) return;
  const rect = host.getBoundingClientRect();
  const screenPoint = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  const worldPoint = editor.screenToWorld(screenPoint);
  const shape = template.factory({
    id: shapeId(`shape-${++createCounter}-${Date.now().toString(36)}`),
    layerId: DEFAULT_LAYER_ID,
    position: worldPoint,
    order: orderForTop(
      [...editor.scene.shapes.values()]
        .filter((s) => s.layerId === DEFAULT_LAYER_ID)
        .map((s) => s.order),
    ),
  });
  editor.addShape(shape);
});

// --- History panel + Undo/Redo buttons ---

const renderHistoryPanel = () => {
  const past = editor.history.undoStack;
  const future = editor.history.redoStack;

  historyCounter.textContent = `${past.length} / ${past.length + future.length}`;

  if (past.length === 0 && future.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No history yet.</div>';
    return;
  }

  const parts: string[] = [];
  past.forEach((patch, i) => {
    const isCursor = i === past.length - 1;
    parts.push(historyItemHtml(describePatch(patch), "past", isCursor));
  });
  if (past.length === 0) {
    parts.push(historyItemHtml("Initial", "past", true));
  }
  if (future.length > 0) {
    parts.push('<hr class="history-divider" />');
    for (let i = future.length - 1; i >= 0; i--) {
      parts.push(historyItemHtml(describePatch(future[i]!), "future", false));
    }
  }
  historyList.innerHTML = parts.join("");
};

const historyItemHtml = (label: string, kind: "past" | "future", cursor: boolean): string => {
  const cls = ["history-item", kind, cursor ? "cursor" : ""].filter(Boolean).join(" ");
  return `<div class="${cls}"><span class="marker"></span><span class="label">${escapeHtml(label)}</span></div>`;
};

const refreshUi = () => {
  undoBtn.disabled = !editor.canUndo;
  redoBtn.disabled = !editor.canRedo;
  renderHistoryPanel();
};
editor.subscribe(refreshUi);
refreshUi();

// --- Hotkeys ---

window.addEventListener("keydown", (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
  const isMeta = ev.metaKey || ev.ctrlKey;
  if (isMeta && (ev.key === "z" || ev.key === "Z")) {
    ev.preventDefault();
    if (ev.shiftKey) editor.redo();
    else editor.undo();
    return;
  }
  if (isMeta && (ev.key === "y" || ev.key === "Y")) {
    ev.preventDefault();
    editor.redo();
    return;
  }
  if (isMeta || ev.altKey) return;
  let mode: Mode | null = null;
  if (ev.key === "v" || ev.key === "V") mode = "select";
  else if (ev.key === "r" || ev.key === "R") mode = "draw-rect";
  else if (ev.key === "e" || ev.key === "E") mode = "draw-ellipse";
  if (mode) {
    editor.setMode(mode);
    setActiveMode(mode);
  }
});

// --- Stage resize ---

const ro = new ResizeObserver(() => {
  const next = host.getBoundingClientRect();
  layered.resize(next.width, next.height);
  editor.setMode(editor.mode);
});
ro.observe(host);

// eslint-disable-next-line no-console
console.log(
  `[demo] editor ready: ${editor.scene.shapes.size} shapes, ` +
    `${defaultRegistry.list().length} templates, mode=${editor.mode}, ` +
    `${width.toFixed(0)}×${height.toFixed(0)} CSS px @ DPR ${window.devicePixelRatio}`,
);
