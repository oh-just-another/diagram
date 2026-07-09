---
"@oh-just-another/state": patch
---

Rework image cropping to an Excalidraw-style handle interaction. The crop frame is now the image's visible box: double-click an image to enter crop mode, then drag the 8 edge/corner handles to hide pixels (opposite edge stays fixed, the source is never stretched) or drag the image body to pan the source under the frame. A faint full-image ghost is drawn behind the frame so the hidden regions stay visible. Enter/click-outside commits (one undo step), Escape cancels. Replaces the previous rubber-band "draw a rectangle over the image" model.

New pure geometry in `tool-ops` (`computeCropHandleDrag`, `computeCropBodyPan`, `computeCommitImageCrop`, `cropFullImageLocalRect`, `cropHandleWorldPoints`, `CropHandle`) and Editor methods (`cropHandleAtWorld`, `beginImageCropHandle`, `beginImageCropBody`); `imageCropSession` now exposes the pending `{crop, position, width, height}`. The normalised `ImageCrop` data model is unchanged. Removed `cropRectFromWorldDrag`.
