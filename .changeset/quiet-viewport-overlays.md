---
"@oh-just-another/react-ui": patch
---

Canvas-anchored DOM overlays (link badges, sticky reaction bars) hide while the viewport is moving and reappear ~150 ms after it settles. Re-rendering them on every pan/zoom frame made React reconciliation a per-frame main-thread cost; with the render loop otherwise clean this was the last interaction-time hitch.
