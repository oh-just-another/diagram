---
"@oh-just-another/scene": minor
"@oh-just-another/renderer-core": minor
"@oh-just-another/serialization": patch
"@oh-just-another/react-ui": minor
---

Text highlight color. New `TextStyle.highlight` paints a marker-style line-height stripe behind the glyphs on every backend, works per styled run (inline-edit range selection highlights just those characters) and round-trips through serialization. The text toolbar gained a Highlight control next to the text color.
