---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": patch
---

"Replace image" is now "Replace media": `Editor.replaceImageFile` accepts GIFs and videos in addition to static images. The shape keeps its position and width (height refits to the new aspect — videos measure via a hidden looping `<video>`, same as the drop handler); animation fields (`animationKind` / `animationData` / `metadata.animated`) are rewritten to match the new media kind, and the crop resets when the media kind changes. The toolbar control's file picker accepts `image/*,video/*`.
