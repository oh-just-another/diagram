---
"@oh-just-another/scene": patch
---

Tunables that lived as file-local literals are now named exports: `SPATIAL_GRID_CELL_SIZE` (default `SpatialGrid` / `buildSpatialIndex` cell), `LINK_HIT_THRESHOLD` (default `findLinkAt` tolerance) and `MAX_PARENT_DEPTH` (parent-chain walk bound). Values unchanged.
