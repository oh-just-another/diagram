---
"@oh-just-another/state": minor
"@oh-just-another/editor": minor
---

Transform modifier keys during pointer gestures: hold **Alt** to resize symmetrically about the element's centre, **Shift** to lock the aspect ratio while resizing, and **Shift** to constrain a move to a single axis (Cmd/Ctrl already pulls a shape off the grid for one gesture). `<Editor>` mirrors the modifiers from keyboard events automatically; headless hosts can drive them via `Editor.setTransformModifiers({ alt, shift })`. Applies to single shapes, multi-selection / group resizes, and text.
