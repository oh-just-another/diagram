---
"@oh-just-another/state": patch
---

Perf: memoize the overlay-options bag per overlay target and reuse it across frames whose overlay inputs are identity-unchanged (idle / animation / peer-update frames), rebuilding only on a real state change; GIF "play" badges are still recomputed every frame. Feed the persistent spatial index (shared with the hit-test path) to the tile compositor so large-scene tile rasterisation queries the index instead of scanning every shape per tile. Group isolation (dim) / per-element hide now correctly fall back to the full `renderScene` path when the tile cache is enabled, instead of silently dropping the dim/hide effect. Behaviour is unchanged when no tile cache is used and when no isolation/hide is active.
