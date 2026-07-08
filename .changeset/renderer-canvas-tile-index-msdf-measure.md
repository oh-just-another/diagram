---
"@oh-just-another/renderer-canvas": minor
---

Perf: two hot-path optimizations.

- `renderViaTiles` accepts an optional `index` (`SpatialGrid`) in `RenderViaTilesOptions`. When supplied, per-tile element selection queries the index instead of scanning every shape in every layer (`O(shapes + Σtiles·candidates)` vs `O(tiles×shapes)`); draw order is preserved. Omitting it falls back to the full scan, unchanged. Micro-bench (10k shapes × 169 tiles): ~299 → ~7 ms/frame (~42×), including a per-frame draw-order rebuild.
- MSDF width measurement is now single-pass and memoized per atlas: `measureText`/`textMetrics` share one `advance/unitsPerEm` walk with the layout pass, so a measure after the same run was drawn (caret/selection geometry) is O(1). Measured and drawn widths stay identical.
