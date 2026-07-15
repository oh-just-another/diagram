---
"@oh-just-another/scene": minor
"@oh-just-another/renderer-core": minor
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Link captions: measured rounded pill, multiline, correct placement and hit-testing.

- `scene`: new shared label geometry (`linkLabelAnchor`, `estimateLinkLabelBox`,
  `linkLabelBounds`, `pointAlongPath`) — one source of truth for the renderer,
  hit-testing and culling. `findLinkAt` now also hits inside the caption pill.
  Elbow links place an unpositioned label on the longest segment's midpoint;
  explicit `label.position` is clamped away from the arrowheads. Tunables in
  `constants.ts` (`LINK_LABEL_MAX_WIDTH`, paddings, clearance).
- `renderer-core`: the caption is a rounded pill sized by real `measureText`
  word-wrap (multiline, `\n` breaks) instead of a square estimated box; it
  rides the drawn geometry (flattened curve for bezier, not the chord), and
  `computeLinkWorldBounds` unions the pill so dirty-rect / viewport culling
  never clip it. `LABEL_POSITION` / `LABEL_FONT_SIZE` constants moved to
  `scene` as `LINK_LABEL_DEFAULT_POSITION` / `LINK_LABEL_DEFAULT_FONT_SIZE`.
- `state`: `linkLabelWorld` uses the shared anchor, so the inline editor opens
  exactly over the pill (including bezier and elbow links).
- `react-ui`: the inline caption editor is a multiline textarea — Enter
  commits, Shift+Enter inserts a newline, Escape cancels.
