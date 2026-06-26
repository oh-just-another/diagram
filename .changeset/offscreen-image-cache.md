---
"@oh-just-another/renderer-canvas": minor
---

The offscreen worker backend no longer re-ships an `ImageBitmap` on every frame. `RecordingTarget` now interns bitmaps by identity to a stable id: the first draw emits a `defineImage` carrying the pixels, later draws of the same bitmap emit only a small `drawImage` referencing the id. The worker keeps a same-capacity LRU mirror (closing evicted clones), so animated GIF / video frames held across several rAF ticks cost one tiny command instead of a full structured-clone copy. `replayCommands` takes an optional image-cache argument the worker owns across replays.
