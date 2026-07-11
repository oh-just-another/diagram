---
"@oh-just-another/react-ui": patch
"@oh-just-another/state": patch
---

The keyboard-shortcuts help dialog now lists every real binding. The `arrange` category (align / flip / distribute) was missing from the dialog's category order and is now shown, and keyTest-driven bindings (nudge arrows, Enter edit/create, plus flowchart create/navigate) surface their chips via a new display-only `Action.displayHotkey` field instead of rendering as "—". `displayHotkey` is never dispatched (only `hotkey`/`keyTest`/`sequence` are), which also closes a latent hole where a display matcher could fire a Ctrl-modified combo the `keyTest` deliberately excluded.
