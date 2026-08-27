---
"@oh-just-another/scene": minor
"@oh-just-another/serialization": minor
"@oh-just-another/renderer-core": minor
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Image shape masks: `ImageElement.mask` clips the drawn box to an ellipse, rounded rect (normalised `radius`) or arbitrary normalised polygon (presets in `IMAGE_MASK_POLYGON_PRESETS`), applied after `crop` and reaching every backend and PNG / SVG exports through the new `RenderTarget.clip`. `Editor.setImageMask(ids, mask | null)` sets/clears it (undoable); the image toolbar gained a mask picker next to Crop: aspect presets (Custom / Original / Circle / Square / Portrait / Landscape / Wide via `Editor.setImageAspectPreset` — centre-crop to the ratio, box refit, Circle adds an ellipse mask) plus shape tiles with a corner-radius slider.
