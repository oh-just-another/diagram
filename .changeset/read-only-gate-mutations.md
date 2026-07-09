---
"@oh-just-another/state": patch
"@oh-just-another/react-ui": patch
---

Make read-only (view) mode a true guard. Every mutating `Editor` method reachable from the UI (`updateStyle`, `updateTextProps`, `deleteSelected`, `duplicateSelected`, group/ungroup, align/flip/distribute, z-order, `moveSelectionBy`, `setLink`, `convertSelection`, `clear`, etc.) is now a no-op while `readOnly` is set, backstopping direct panel/hotkey calls that previously bypassed the pointer-level gate. The overlay keeps the selection outline (halo) but no longer paints resize/rotate/group handles or link endpoint grips in read-only, and the property panel / selection floating panel / mutating context-menu entries are hidden. `copy` / `copy-style` are flagged view-safe so they stay live.
