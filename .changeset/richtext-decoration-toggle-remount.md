---
"@oh-just-another/react-ui": patch
---

Fix the bold / italic / underline / strikethrough toggles in the text style popover never applying to an in-edit text selection. The toggle button was a component defined inside `TextDecorationControl`, so it got a fresh identity on every panel re-render; during inline text editing the panel re-renders continuously (caret blink), and a remount between `mousedown` and `mouseup` swallowed the synthesized `click`. Hoisted the toggle to a stable module-level component so the button persists across re-renders and the click fires. Colour was unaffected (it goes through a stable control).
