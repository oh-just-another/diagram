---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Add two interaction tools: an eraser (mode `erase`, hotkey `E`) and a laser pointer (mode `laser`, hotkey `K`).

- Eraser: press-and-drag sweeps shapes under the cursor into a pending set (previewed dimmed) and deletes them all in one undo step on release. Attached links are removed with their shapes, like a Delete-key delete.
- Laser pointer: press-and-drag paints an ephemeral red trail that fades over a couple of seconds. Nothing is written to the scene or history — it lives purely on the overlay. Available in read-only mode. Collab replication of trails is a follow-up.

Both tools appear in the default toolbar (`DEFAULT_TOOLBAR` / `DEFAULT_VERTICAL_TOOLBAR`) and are registered as `mode-erase` / `mode-laser` actions. TTL, colour and width of the laser trail are tunable via `state/constants.ts`.
