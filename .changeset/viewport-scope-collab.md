---
"@oh-just-another/collab": patch
---

Collab no longer replicates the camera. Only document-scoped viewport settings (grid on/off, grid style, snap-to-grid — the `"export"` scope of `VIEWPORT_SCOPE`) travel through the CRDT; pan, zoom, rotation and viewport size stay local to each peer. Remote snapshots are applied with the local camera overlaid, so another user's panning or zooming never moves your view.
