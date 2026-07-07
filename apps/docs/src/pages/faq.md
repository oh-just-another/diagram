---
title: FAQ
---

# FAQ

## Is it free to use?

Yes. The library is MIT-licensed — free for any project, commercial included, with no production gate or forced watermark.

## Which renderer does it use?

The canvas auto-selects a backend — WebGL2, an OffscreenCanvas worker, or Canvas2D — and downgrades to Canvas2D if one fails at runtime. Force one with `capabilities={{ renderer: "webgl2" }}`.

## Can it render on the server?

Yes. Render a scene to an SVG string with `renderSceneToSvg` from `@oh-just-another/renderer-svg`, or to a PNG `Blob` with `exportSceneToPng` — no DOM required.

## Do I have to use React?

The drop-in `<Editor>` is a React component. The lower-level packages (scene, renderers, serialization) are framework-agnostic and usable on their own.
