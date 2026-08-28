---
"@oh-just-another/renderer-core": patch
---

Remove the unused `LOD_THRESHOLD` export — the tile compositor never read it; screen-size LOD (`LodOptions`) is the only level-of-detail mechanism.
