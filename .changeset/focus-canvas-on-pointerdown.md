---
"@oh-just-another/state": patch
---

The canvas surface now takes keyboard focus on pointer-down. The press handler
calls `preventDefault()` (to suppress text selection / native scroll), which also
suppressed the browser's default focus-on-click — so clicking the canvas left it
unfocused and keyboard shortcuts (or a clean blur of a previously-focused panel
input) only worked after tabbing to it, reading as "the first click did nothing".
The handler now focuses the host explicitly, skipping the case where the press
lands on an in-canvas text field so editing keeps its own focus.
