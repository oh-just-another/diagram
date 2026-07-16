---
"@oh-just-another/collab": patch
---

`bindEditor` no longer re-emits remote updates as its own writes. The editor's change subscriber fires synchronously inside `loadScene`, so applying a remote snapshot used to diff it against the stale scene and re-write every remote change under the local clientID. Those echoes win Y.Map conflicts against the author's next concurrent write whenever the echoing client has the higher clientID — on the other peer, dragging kept snapping back to the old position. Remote application is now guarded, so peers stay silent for changes they merely adopt.
