---
"@oh-just-another/renderer-canvas": patch
---

Fix: video (and other non-bitmap drawable) sources now render on the
offscreen backend. The recorder used to ship only `ImageBitmap`s and silently
skipped `<video>` elements — mp4 images never drew. It now snapshots the
source's current pixels into a worker-ownable `ImageBitmap` via a reused
scratch `OffscreenCanvas` (`transferToImageBitmap`): statics are interned
once, dynamic sources (playing video, animated `<img>`) re-capture per draw
under the same id with a generation bump so the frame signature changes and
the layer reposts; the worker closes each replaced clone.
