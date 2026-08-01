---
"@oh-just-another/react-ui": patch
---

The floating selection toolbar now hides for the duration of an element gesture (move / resize / rotate) and reappears `GESTURE_QUIET_MS` (200 ms) after it ends — per-frame floating-ui repositioning plus a full toolbar re-render was making dragged elements visibly lag.
