---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

The eyedropper is no longer a standalone toolbar tool (its palette button and the `Alt+I` hotkey / `mode-eyedropper` action are removed). Instead, every colour picker (`ColorSwatchPicker`) gains an optional pipette button via a new `onEyedrop` prop: clicking it arms `Editor.beginEyedropperPick(onPick)` and the next canvas click samples the colour of the shape under the cursor straight into that swatch — without changing the current tool mode. New editor API: `beginEyedropperPick` and the `isEyedropperArmed` flag; the cursor shows a crosshair while armed.
