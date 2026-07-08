---
"@oh-just-another/scene": minor
"@oh-just-another/serialization": minor
"@oh-just-another/state": minor
"@oh-just-another/renderer-core": minor
"@oh-just-another/renderer-canvas": minor
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": minor
---

Add four editor tools:

- **Eyedropper** — new `eyedropper` mode (toolbar button, `Alt+I`). Click a
  shape to sample its fill/stroke and apply it to the selection.
  `Editor.pickColorAt` / `applyEyedropperAt` + pure `pickColorAt`.
- **Convert element type** — `Editor.convertSelection(target)` and pure
  `computeConvertType` switch rectangle ↔ ellipse ↔ diamond (polygon) in place,
  preserving position/size/style. New "Shape type" property-panel control.
- **Image crop** — optional normalised `crop` rect on `ImageElement` (additive,
  serialised). New `crop` mode entered by double-clicking an image or the
  property-panel Crop button: drag a frame, `Enter` to apply, `Esc` to cancel.
  Canvas2D renders the cropped source region (`RenderTarget.drawImage` gains an
  optional `crop` arg). `Editor.beginImageCrop` / `commitImageCrop` /
  `cancelImageCrop` + pure `computeSetImageCrop` / `cropRectFromWorldDrag`.
- **Flowchart auto-generate** — `Cmd/Ctrl+Alt+Arrow` spawns a connected node
  from the selected node in that direction. `Editor.spawnConnectedNode` + pure
  `computeSpawnConnectedNode`.

Also exposes `worldToLocal` from `@oh-just-another/scene`.
