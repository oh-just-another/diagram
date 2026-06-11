#!/usr/bin/env bash
# Boots the `diagram-collab` relay server from the sibling directory.
# Used by the root `pnpm dev:collab` script — the server lives in
# its own repo so this wrapper hides
# the path lookup, dependency install, and a friendly error message
# when the repo isn't checked out yet.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COLLAB_DIR="$(cd "$REPO_ROOT/.." && pwd)/diagram-collab"

if [ ! -d "$COLLAB_DIR" ]; then
  echo "" >&2
  echo "✗ diagram-collab repo not found at: $COLLAB_DIR" >&2
  echo "" >&2
  echo "  Clone it as a sibling directory:" >&2
  echo "    cd $(dirname "$REPO_ROOT")" >&2
  echo "    git clone <repo-url> diagram-collab" >&2
  echo "    cd diagram-collab && pnpm install" >&2
  echo "" >&2
  echo "  See the collab-server setup for details." >&2
  exit 1
fi

cd "$COLLAB_DIR"

if [ ! -d "node_modules" ]; then
  echo "→ Installing diagram-collab dependencies (one-time setup)..."
  pnpm install
fi

exec pnpm dev
