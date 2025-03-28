#!/usr/bin/env bash
# Build the two WASM crates (text-shaper + rasterizer) and drop
# the resulting `.wasm` artifacts into their npm packages so
# `pnpm pack` includes them. Run from repo root.
#
# Re-run after editing any file under `wasm-src/`. Idempotent —
# cargo's incremental build is the source of truth.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> building text-shaper.wasm"
(cd wasm-src/text-shaper && cargo build --release --target wasm32-unknown-unknown)
cp wasm-src/text-shaper/target/wasm32-unknown-unknown/release/text_shaper.wasm \
   packages/text-wasm/wasm/text_shaper.wasm

echo "==> building rasterizer.wasm"
(cd wasm-src/rasterizer && cargo build --release --target wasm32-unknown-unknown)
cp wasm-src/rasterizer/target/wasm32-unknown-unknown/release/rasterizer.wasm \
   packages/raster-wasm/wasm/rasterizer.wasm

echo
echo "Sizes:"
ls -la packages/text-wasm/wasm/ packages/raster-wasm/wasm/
