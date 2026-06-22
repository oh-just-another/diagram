---
"@oh-just-another/editor": minor
---

`<Editor>` now registers a built-in GIF animation adapter by default, so dropped / pasted animated GIFs play out of the box (previously the host had to wire up a decoder). The `gifuct-js` decoder is lazy-loaded on first GIF decode, so apps that never show a GIF don't pay for it. A host `animationAdapters` entry with `kind: "gif"` still overrides the built-in. Also exports `installGifAnimationAdapter` for explicit / component-free use.
