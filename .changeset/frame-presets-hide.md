---
"@oh-just-another/scene": minor
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Frame size presets and frame hiding. The frame toolbar gained a size-preset dropdown (A4, Letter, 16:9, 4:3, 1:1, Phone, Tablet, Browser — `FRAME_SIZE_PRESETS`, applied via the new `Editor.applyFramePreset`) and a Hide-frame button (`Editor.toggleFrameHidden`). Hiding a frame now hides its content too: `isElementHidden` propagates through frame membership (`frameId`), so hidden frames and their members disappear from rendering and become click-through. The frames panel shows an eye toggle per frame to bring hidden frames back.
