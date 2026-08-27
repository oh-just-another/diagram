---
"@oh-just-another/react-ui": patch
"@oh-just-another/state": patch
---

Floating chrome appears in place, instantly: `floatPanel` keeps a panel invisible until its first position resolves (menus, submenus, popovers no longer paint at the corner and jump), and the selection toolbar reveals with `visibility` instead of a fade. A library drag-to-place is now an element gesture — `Editor.placementId` is set from `beginPlacement` until commit / cancel — so the selection toolbar stays hidden and the minimap defers its repaint while the shape is being dragged in.
