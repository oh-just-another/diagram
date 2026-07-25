---
"@oh-just-another/scene": minor
"@oh-just-another/serialization": patch
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Image file tools. The image toolbar (single selection) gained a file-name input (renames the backing `BinaryFile`, undoable), Replace image (swaps the bytes while keeping position / size / crop), Download (original bytes with stored name / mime) and an Alt-text editor backed by the new `ImageElement.alt` field (serialized; surfaced to hosts for accessibility). New editor APIs: `renameBinaryFile`, `setImageAlt`, `replaceImageFile`.
