---
"@oh-just-another/scene": patch
"@oh-just-another/renderer-core": patch
"@oh-just-another/state": patch
"@oh-just-another/react-ui": patch
---

Second review pass on shape labels and stickies. Label text is now strictly contained: when not even one line fits the padded body nothing paints outside the shape (no more tile artifacts after growing the font). Double-click places the caret at the click point instead of jumping to the (possibly clipped) text end. Cmd/Ctrl+A inside the inline editor is handled explicitly, removing a race with the selection mirror that made select-all intermittently need a second press. Labels are real rich text: styling with an active selection applies to just that range (styled runs) rather than the whole label. Stickies lost the folded corner (plain sheet with the bottom drop shadow), and emoji reactions became per-user toggles — your own click adds and then removes YOUR reaction (`toggleStickyReaction`, `reactions[].users`), so counters only grow through other collaborators.
