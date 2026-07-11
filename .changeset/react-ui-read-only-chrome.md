---
"@oh-just-another/react-ui": minor
---

Read-only chrome. `<DiagramRoot>` / `<DiagramCanvas>` accept a `readOnly` prop (applied on mount and synced on change), a new `useReadOnly()` hook exposes the flag reactively, and the `<Toolbar>` disables creation / mutation tools (draw modes, insert-image, tool-lock, undo/redo) in read-only while keeping select / hand live.
