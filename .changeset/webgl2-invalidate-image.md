---
"@oh-just-another/renderer-canvas": minor
---

`WebGL2Target.invalidateImage(source)` (B6): synchronously deletes the GPU
texture cached for an image source, so hosts can release VRAM the moment an
image is discarded or its bitmap replaced — instead of waiting for LRU
pressure to reach the entry. Returns `false` for sources that were never
uploaded; text-bitmap-backed handles stay owned by the text cache.
