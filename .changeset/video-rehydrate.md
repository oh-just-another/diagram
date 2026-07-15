---
"@oh-just-another/state": patch
---

Fix: mp4 shapes survive a page reload. The video file-drop handler never
persisted the bytes into `Scene.files`, so a restored scene had only a dead
`blob:` URL and nothing to rehydrate from (the "dead-blob-url" renderer
warning) on every backend. The handler now stores the file (`fileId` on the
shape), and scene rehydration grew a video branch: it rebuilds the hidden,
muted, looping `<video>` element from the persisted bytes (shared
`createHiddenLoopingVideo` factory with the drop handler) and resumes
playback best-effort. Videos dropped BEFORE this fix have no stored bytes and
still won't restore — re-add them once.
