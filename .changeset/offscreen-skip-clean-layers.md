---
"@oh-just-another/renderer-canvas": patch
---

Offscreen backend: skip re-posting layers whose command stream is unchanged. `RecordingTarget` now folds each recorded command into a rolling content signature (exposed via `lastSignature`), and `OffscreenLayeredSurface.present()` compares it against the last stream shipped to each layer's worker — an identical frame (e.g. a static grid / overlay while only the main layer's GIF advances) is not cloned across the worker boundary nor replayed. Pixel output is unchanged; the worker retains its previous frame.
