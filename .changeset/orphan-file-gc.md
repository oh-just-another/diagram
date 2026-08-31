---
"@oh-just-another/scene": minor
"@oh-just-another/state": minor
---

Binary files no longer outlive the shapes that reference them: deleting (or erasing / cutting) the last shape pointing at a file drops its `scene.files` entry in the same undoable step, so a host store mirroring `scene.files` stops growing with every removed image or video. Undo restores the entry with the shape, and the clipboard carries the bytes so a cut image still pastes. `referencedFileIds(scene)` / `unreferencedFileIds(scene)` are exported from `scene` for hosts that prune their own store.
