---
"@oh-just-another/renderer-canvas": patch
---

Fix a WebGL2 hang when a frame draws more distinct bitmap-text strings than the image-texture cache cap (e.g. the first frame of a large scene before the MSDF atlas is warm): text-bitmap textures no longer count against the image LRU, whose eviction loop could never terminate.
