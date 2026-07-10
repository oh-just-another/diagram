---
"@oh-just-another/state": minor
---

Eraser gains Excalidraw-style Alt-restore. While sweeping the eraser, holding Alt un-marks shapes you drag back over — rescuing them before the delete commits on pointer-up (`extendEraseStroke(world, restore)` / `beginEraseStroke(world, restore)`). Marked-for-erase shapes now preview at a dedicated `ERASE_DIM_OPACITY` (0.2 — a clear "about to delete") instead of the gentler group-isolation dim.
