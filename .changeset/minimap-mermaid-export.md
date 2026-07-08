---
"@oh-just-another/react-ui": minor
"@oh-just-another/importers": minor
---

Add a `<Minimap>` component (react-ui) — a small overview canvas that renders the whole scene with a frame for the current viewport; click / drag to pan the main view. Add `exportMermaid(scene)` (importers) — writes a `flowchart TD` string (inverse of `importMermaid`), round-tripping node + edge structure and emitting `%% skipped: <type>` comments for non-graph elements.
