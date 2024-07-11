import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { Editor, type Mode } from "@oh-just-another/state";
import { buildSampleScene } from "./scene-builder";

installBuiltinRenderers();

const host = document.getElementById("stage");
if (!host) throw new Error("#stage element not found");

const toolbar = document.getElementById("toolbar");
if (!toolbar) throw new Error("#toolbar element not found");

const { width, height } = host.getBoundingClientRect();
const layered = new LayeredCanvas(host, width, height);

const editor = new Editor({
  host,
  mainTarget: layered.get("main"),
  overlayTarget: layered.get("overlay"),
  initialScene: buildSampleScene(width, height),
  initialMode: "select",
});

// Toolbar mode buttons
const buttons = toolbar.querySelectorAll<HTMLButtonElement>("button[data-mode]");
const setActiveButton = (mode: Mode) => {
  for (const btn of buttons) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }
};
toolbar.addEventListener("click", (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const mode = target.dataset.mode as Mode | undefined;
  if (!mode) return;
  editor.setMode(mode);
  setActiveButton(mode);
});

// Hotkeys
window.addEventListener("keydown", (ev) => {
  // Skip when typing in an editable element (none here, but defensive).
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
  let mode: Mode | null = null;
  if (ev.key === "v" || ev.key === "V") mode = "select";
  else if (ev.key === "r" || ev.key === "R") mode = "draw-rect";
  else if (ev.key === "e" || ev.key === "E") mode = "draw-ellipse";
  if (mode) {
    editor.setMode(mode);
    setActiveButton(mode);
  }
});

// Resize stage with window
const ro = new ResizeObserver(() => {
  const next = host.getBoundingClientRect();
  layered.resize(next.width, next.height);
  // The editor keeps its scene; viewport size is informational here.
  // Re-render via subscribe trigger isn't necessary because layered.resize
  // already cleared everything — we trigger a no-op mode set to force redraw.
  editor.setMode(editor.mode);
});
ro.observe(host);

// eslint-disable-next-line no-console
console.log(
  `[demo] editor ready: ${editor.scene.shapes.size} shapes, mode=${editor.mode}, ` +
    `${width}×${height} CSS px @ DPR ${window.devicePixelRatio}`,
);
