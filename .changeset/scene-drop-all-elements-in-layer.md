---
"@oh-just-another/scene": minor
---

Removed the unused `allElementsInLayer` export. Build the same list with `getElementsInLayer(scene, layerId).map((s) => s.id)`.
