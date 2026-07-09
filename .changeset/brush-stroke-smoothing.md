---
"@oh-just-another/state": patch
---

Brush strokes are now smoothed on commit: the sparsely-captured pointer polyline is resampled through a Catmull-Rom spline (interpolating per-point width) before it enters the scene, so a freehand line reads as a fluid curve instead of a chain of angular segments. Shares one spline resampler (`smoothStrokePoints`) with the laser trail. Tunable via `BRUSH_SMOOTH_SEGMENTS`.
