---
"@oh-just-another/editor": patch
---

`<Diagram>`'s chrome shell no longer re-renders on every scene change: the whole-scene subscription (menus, toolbars, dialogs re-rendered on every frame of a drag, making element moves sluggish) is narrowed to the Grid / Snap toggle values only.
