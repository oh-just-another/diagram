import { describe as describePatch } from "@oh-just-another/history";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { Editor, type Mode } from "@oh-just-another/state";
import { buildSampleScene } from "./scene-builder";

installBuiltinRenderers();

const host = document.getElementById("stage");
if (!host) throw new Error("#stage element not found");

const toolbar = document.getElementById("toolbar");
if (!toolbar) throw new Error("#toolbar element not found");

const undoBtn = document.getElementById("btn-undo") as HTMLButtonElement | null;
const redoBtn = document.getElementById("btn-redo") as HTMLButtonElement | null;
if (!undoBtn || !redoBtn) throw new Error("undo/redo buttons missing");

const historyList = document.getElementById("history-list");
const historyCounter = document.getElementById("history-counter");
if (!historyList || !historyCounter) throw new Error("history panel missing");

const { width, height } = host.getBoundingClientRect();
const layered = new LayeredCanvas(host, width, height);

const editor = new Editor({
  host,
  mainTarget: layered.get("main"),
  overlayTarget: layered.get("overlay"),
  initialScene: buildSampleScene(width, height),
  initialMode: "select",
});

// --- Mode buttons ---

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
});

// --- Editor → UI sync ---

const renderHistoryPanel = () => {
  const past = editor.history.undoStack;
  const future = editor.history.redoStack;

  historyCounter.textContent = `${past.length} / ${past.length + future.length}`;

  if (past.length === 0 && future.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No history yet.</div>';
    return;
  }

  const parts: string[] = [];

  // Past entries: oldest at the top.
  past.forEach((patch, i) => {
    const isCursor = i === past.length - 1;
    parts.push(historyItemHtml(describePatch(patch), "past", isCursor));
  });

  // The cursor sits between past and future. If there is no past, draw a
  // tiny "initial" marker so users see where the cursor is.
  if (past.length === 0) {
    parts.push(historyItemHtml("Initial", "past", true));
  }

  // Divider only when there are future entries.
  if (future.length > 0) {
    parts.push('<hr class="history-divider" />');
    // Redo stack: the most recently undone is **last** in `redoStack`, but
    // visually we want the next-to-redo (closest to the cursor) on top, so we
    // iterate in reverse.
    for (let i = future.length - 1; i >= 0; i--) {
      parts.push(historyItemHtml(describePatch(future[i]!), "future", false));
    }
  }

  historyList.innerHTML = parts.join("");
};

const historyItemHtml = (label: string, kind: "past" | "future", cursor: boolean): string => {
  const cls = ["history-item", kind, cursor ? "cursor" : ""].filter(Boolean).join(" ");
  // Basic escaping — `label` is short and produced by `describePatch`, but a
  // shape `type` could be user-controlled in plugins.
  const safe = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div class="${cls}"><span class="marker"></span><span class="label">${safe}</span></div>`;
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
  `[demo] editor ready: ${editor.scene.shapes.size} shapes, mode=${editor.mode}, ` +
    `${width.toFixed(0)}×${height.toFixed(0)} CSS px @ DPR ${window.devicePixelRatio}`,
);
