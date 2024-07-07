import { renderScene } from "@oh-just-another/renderer-core";
import { installBuiltinRenderers, LayeredCanvas } from "@oh-just-another/renderer-canvas";
import { buildSampleScene } from "./scene-builder";

installBuiltinRenderers();

const host = document.getElementById("stage");
if (!host) throw new Error("#stage element not found");

const { width, height } = host.getBoundingClientRect();
const layered = new LayeredCanvas(host, width, height);
const scene = buildSampleScene(width, height);

const t0 = performance.now();
renderScene(scene, layered.get("main"));
const elapsed = performance.now() - t0;

// eslint-disable-next-line no-console
console.log(
  `[demo] rendered ${scene.shapes.size} shapes in ${elapsed.toFixed(2)} ms ` +
    `(${width}×${height} CSS px @ DPR ${window.devicePixelRatio})`,
);

// Re-render on resize so the page feels alive at different window sizes.
const resizeObserver = new ResizeObserver(() => {
  const next = host.getBoundingClientRect();
  layered.resize(next.width, next.height);
  const rebuilt = buildSampleScene(next.width, next.height);
  renderScene(rebuilt, layered.get("main"));
});
resizeObserver.observe(host);
