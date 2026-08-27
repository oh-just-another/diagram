---
"@oh-just-another/react-ui": minor
---

Minimap: a schematic overview — white paper with every element's box in the system accent colour (no renderer pass) — that repaints only when the editor goes idle (`MINIMAP_IDLE_MS`): never during element drags, pans, pinches or wheel bursts, and once right after. `MINIMAP_THROTTLE_MS` is replaced by `MINIMAP_IDLE_MS`, `MINIMAP_BACKGROUND`, `MINIMAP_ELEMENT_COLOR`, `MINIMAP_ELEMENT_OPACITY`.
