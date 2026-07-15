---
"@oh-just-another/renderer-canvas": minor
---

Offscreen backend (B18): the per-frame worker hop no longer structured-clones
an array of command objects. Frames are packed into one transferable
`ArrayBuffer` of Float64 words plus a deduplicated string table
(`packReplayFrame` / `replayPackedFrame` in `replay-codec.ts`) — encode is
~15× cheaper than the old clone (~0.1 ms vs ~1.5 ms for a 500-shape frame)
and the numeric bulk transfers zero-copy. `ImageBitmap` payloads still travel
as clones in a side array (the recorder's intern LRU owns the sources).
Unchanged-layer skip behaviour is untouched.
