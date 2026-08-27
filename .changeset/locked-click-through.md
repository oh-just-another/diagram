---
"@oh-just-another/scene": minor
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Locked elements are now click-through: the pointer hit-test skips locked (and hidden) shapes and picks whatever lies beneath, instead of letting them shadow the shapes below. Locking a selection drops it. Unlocking moved to the right-click context menu ("Unlock", backed by the new `Editor.lockedElementAt` / `Editor.unlockElement`), and the selection toolbar gained a Lock button plus a "Lock" context-menu entry. `getElementAt` / `getElementAtIndexed` accept an optional `accept` predicate that skips rejected shapes and keeps scanning beneath them.
