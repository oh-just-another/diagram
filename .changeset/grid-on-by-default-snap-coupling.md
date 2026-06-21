---
"@oh-just-another/scene": minor
"@oh-just-another/state": minor
---

Couple snap-to-grid to grid visibility, and turn the grid on by default.

Snapping is now active only while a grid is actually displayed — the toggle is
on (`gridVisible`) AND the scene has a positive `gridSize`, the same condition
`renderGrid` paints under. Snapping to an invisible grid is gone: no grid → no
snap, always.

`DEFAULT_VIEWPORT` now ships `gridSize: DEFAULT_GRID_SPACING` (tune it in scene
`constants.ts`), so a fresh scene has a visible grid and snapping on. Pass a
scene with `gridSize: 0` (or omit it on a custom viewport) for a gridless,
snap-free canvas.
