---
"@oh-just-another/state": minor
---

`Editor.renderLod` / `setRenderLod(lod)` thread the level-of-detail thresholds into the main render pass (previously a hard-coded `DEFAULT_LOD`), and `Editor.frameStats` plus the new `frame` event report every painted frame: `lastMs` / EMA `emaMs` (the render pass), the achieved frame gap `gapMs` (what the user sees as fps), the display interval `intervalMs` measured by an idle `requestAnimationFrame` probe, and the frame count. The spatial index is no longer rebuilt on viewport-only scene changes (every pan / zoom frame on a large scene).
