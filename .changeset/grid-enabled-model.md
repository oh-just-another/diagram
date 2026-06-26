---
"@oh-just-another/scene": minor
"@oh-just-another/serialization": minor
"@oh-just-another/state": minor
"@oh-just-another/renderer-core": minor
"@oh-just-another/editor": minor
---

Grid model rework. The viewport's `gridSize` (spacing that doubled as a hidden/
shown toggle) is replaced by an explicit `gridEnabled` boolean; spacing is fixed
at `DEFAULT_GRID_SPACING`. The runtime `gridVisible` flag is removed — grid
on/off now lives on the scene viewport and persists with it. Scene documents
migrate v1 → v2 automatically (`gridSize > 0` → `gridEnabled: true`). `<Editor>`
ships gridless by default; hosts enable the grid per scene.
