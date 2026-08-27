---
"@oh-just-another/state": patch
"@oh-just-another/react-ui": patch
---

The minimap's viewport frame follows a drag-pan: `Editor.endPanGesture` now notifies subscribers, so idle-gated observers that skip every notify while `panGesture` is set get the trailing change and repaint once the gesture ends.
