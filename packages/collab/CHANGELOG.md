# @oh-just-another/collab

## 0.59.8

### Patch Changes

- @oh-just-another/state@0.67.3

## 0.59.7

### Patch Changes

- @oh-just-another/state@0.67.2

## 0.59.6

### Patch Changes

- Updated dependencies [7f26f79]
- Updated dependencies [4aec396]
  - @oh-just-another/scene@0.63.1
  - @oh-just-another/state@0.67.1
  - @oh-just-another/history@0.57.7

## 0.59.5

### Patch Changes

- Updated dependencies [0846934]
  - @oh-just-another/scene@0.63.0
  - @oh-just-another/state@0.67.0
  - @oh-just-another/history@0.57.6

## 0.59.4

### Patch Changes

- Updated dependencies [6924e11]
  - @oh-just-another/state@0.66.0

## 0.59.3

### Patch Changes

- Updated dependencies [e28d529]
  - @oh-just-another/state@0.65.0

## 0.59.2

### Patch Changes

- Updated dependencies [c738f81]
  - @oh-just-another/state@0.64.0

## 0.59.1

### Patch Changes

- Updated dependencies [98070d8]
- Updated dependencies [f12caa8]
- Updated dependencies [76463dd]
- Updated dependencies [2942fb9]
- Updated dependencies [d0eb799]
- Updated dependencies [e202058]
- Updated dependencies [e0e4ea9]
- Updated dependencies [d658680]
- Updated dependencies [e66a8a5]
- Updated dependencies [10eac46]
- Updated dependencies [3e5d81f]
- Updated dependencies [a6fe14d]
- Updated dependencies [06a0625]
- Updated dependencies [09bc11a]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [3019bc7]
- Updated dependencies [2e2a9e7]
- Updated dependencies [f46e3da]
- Updated dependencies [350c6d3]
- Updated dependencies [58c944b]
- Updated dependencies [518a6d1]
- Updated dependencies [b1e08de]
- Updated dependencies [e6057d1]
- Updated dependencies [2cd199e]
- Updated dependencies [745d7a9]
- Updated dependencies [67b98bb]
- Updated dependencies [7d15a0c]
- Updated dependencies [59695d7]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [24c33b3]
- Updated dependencies [8f8846b]
- Updated dependencies [22c0f48]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [22ecd4b]
- Updated dependencies [8163681]
- Updated dependencies [d8bf8c1]
  - @oh-just-another/state@0.63.0
  - @oh-just-another/scene@0.62.0
  - @oh-just-another/history@0.57.5

## 0.59.0

### Minor Changes

- 855fdb7: Collab sessions now re-synchronize after a reconnect. `Transport` gains an optional `onStatusChange` (with the new `TransportStatus` type); `EncryptedTransport` forwards the inner transport's status; `TransportProvider` listens for it and, on every reconnect, re-requests the peers' state, offers its own full state and re-announces local awareness. Previously, frames lost while the socket was dying left the Yjs delta chain broken — peers silently stopped applying each other's updates until a full reload.

### Patch Changes

- e47c768: `bindEditor` no longer re-emits remote updates as its own writes. The editor's change subscriber fires synchronously inside `loadScene`, so applying a remote snapshot used to diff it against the stale scene and re-write every remote change under the local clientID. Those echoes win Y.Map conflicts against the author's next concurrent write whenever the echoing client has the higher clientID — on the other peer, dragging kept snapping back to the old position. Remote application is now guarded, so peers stay silent for changes they merely adopt.
- c3fde98: Collab no longer replicates the camera. Only document-scoped viewport settings (grid on/off, grid style, snap-to-grid — the `"export"` scope of `VIEWPORT_SCOPE`) travel through the CRDT; pan, zoom, rotation and viewport size stay local to each peer. Remote snapshots are applied with the local camera overlaid, so another user's panning or zooming never moves your view.
- Updated dependencies [855fdb7]
  - @oh-just-another/network@0.58.0

## 0.58.3

### Patch Changes

- Updated dependencies [ac128db]
  - @oh-just-another/state@0.62.0

## 0.58.2

### Patch Changes

- Updated dependencies [0548ab3]
- Updated dependencies [762dd8a]
- Updated dependencies [4722388]
- Updated dependencies [05707ed]
- Updated dependencies [50a2bd4]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
- Updated dependencies [3c50ef1]
- Updated dependencies [f960332]
  - @oh-just-another/state@0.61.0
  - @oh-just-another/scene@0.61.0
  - @oh-just-another/history@0.57.4

## 0.58.1

### Patch Changes

- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [641842b]
- Updated dependencies [c189261]
- Updated dependencies [c58054b]
- Updated dependencies [b156869]
- Updated dependencies [0d3934e]
- Updated dependencies [b0a9f3b]
- Updated dependencies [571f13b]
- Updated dependencies [ca48e8a]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [bdc847e]
- Updated dependencies [511a22a]
- Updated dependencies [a9558d9]
- Updated dependencies [22b90f9]
- Updated dependencies [f381039]
- Updated dependencies [295f38b]
- Updated dependencies [bd2e26c]
- Updated dependencies [97de2fd]
- Updated dependencies [71a6c8b]
- Updated dependencies [7f69f29]
- Updated dependencies [dde8279]
- Updated dependencies [cec8f83]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [cf8b735]
- Updated dependencies [571f13b]
  - @oh-just-another/scene@0.60.0
  - @oh-just-another/state@0.60.0
  - @oh-just-another/history@0.57.3

## 0.58.0

### Minor Changes

- d1627f2: Renamed `YjsHistory` / `YjsHistoryOptions` to `CollabHistory` / `CollabHistoryOptions`, so the public name describes the role (collaborative undo scoped to the local client) rather than the backing implementation.

### Patch Changes

- Updated dependencies [b4b252b]
- Updated dependencies [d20d50a]
- Updated dependencies [0152ed6]
- Updated dependencies [938e7c8]
- Updated dependencies [9673846]
- Updated dependencies [f370dba]
- Updated dependencies [8f00738]
- Updated dependencies [da91d59]
- Updated dependencies [3152317]
- Updated dependencies [fc47ecc]
- Updated dependencies [8fc6b69]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
- Updated dependencies [edde5d0]
- Updated dependencies [1c7cc6c]
- Updated dependencies [c5be6e5]
  - @oh-just-another/state@0.59.0
  - @oh-just-another/scene@0.59.0
  - @oh-just-another/history@0.57.2

## 0.57.1

### Patch Changes

- Updated dependencies [d1b96d9]
  - @oh-just-another/scene@0.58.0
  - @oh-just-another/state@0.58.0
  - @oh-just-another/history@0.57.1
  - @oh-just-another/serialization@0.57.1

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/history@0.57.0
  - @oh-just-another/network@0.57.0
  - @oh-just-another/scene@0.57.0
  - @oh-just-another/serialization@0.57.0
  - @oh-just-another/state@0.57.0
  - @oh-just-another/types@0.57.0
