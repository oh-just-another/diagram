---
"@oh-just-another/react-ui": patch
"@oh-just-another/diagram": patch
---

The canvas surface no longer draws a focus ring on a mouse click. The surface
takes focus on press (so keyboard shortcuts work right after clicking), which
made it light up with an outline like a focused text input. The ring is now
gated on `:focus-visible`, so it appears only for keyboard focus (Tab) and never
for a pointer press.
