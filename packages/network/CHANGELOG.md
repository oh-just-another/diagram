# @oh-just-another/network

## 0.58.0

### Minor Changes

- 855fdb7: Collab sessions now re-synchronize after a reconnect. `Transport` gains an optional `onStatusChange` (with the new `TransportStatus` type); `EncryptedTransport` forwards the inner transport's status; `TransportProvider` listens for it and, on every reconnect, re-requests the peers' state, offers its own full state and re-announces local awareness. Previously, frames lost while the socket was dying left the Yjs delta chain broken — peers silently stopped applying each other's updates until a full reload.

## 0.57.0

### Minor Changes

- Version bump just for publishing.
