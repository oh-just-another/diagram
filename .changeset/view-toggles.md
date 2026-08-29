---
"@oh-just-another/state": minor
"@oh-just-another/editor": minor
---

View toggles for links and comment pins: `Editor.showConnectors` / `setShowConnectors` / `toggleConnectors` and `showComments` / `setShowComments` / `toggleComments` (editor state — not persisted, not exported). Hidden links and pins are neither painted nor hit-testable, and their selection is dropped. Actions `toggle-connectors` / `toggle-comments`; the main menu's View section gains "Flow connectors" and "Comments" switches.
