# diagram

Monorepo library for drawing diagrams: browser editor + headless-render for servers, split into independent npm packages.

<!-- Badges track the flagship drop-in package, @oh-just-another/editor. -->

[![npm version](https://img.shields.io/npm/v/@oh-just-another/editor.svg)](https://www.npmjs.com/package/@oh-just-another/editor)
[![CI](https://github.com/oh-just-another/diagram/actions/workflows/ci.yml/badge.svg)](https://github.com/oh-just-another/diagram/actions/workflows/ci.yml)
[![install size](https://packagephobia.com/badge?p=@oh-just-another/editor)](https://packagephobia.com/result?p=@oh-just-another/editor)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/@oh-just-another/editor)](https://bundlephobia.com/package/@oh-just-another/editor)
[![npm downloads](https://img.shields.io/npm/dm/@oh-just-another/editor.svg)](https://www.npmjs.com/package/@oh-just-another/editor)
[![types included](https://img.shields.io/npm/types/@oh-just-another/editor.svg)](https://www.npmjs.com/package/@oh-just-another/editor)
[![license](https://img.shields.io/npm/l/@oh-just-another/editor.svg)](./LICENSE)
[![contributors](https://img.shields.io/github/contributors/oh-just-another/diagram.svg)](https://github.com/oh-just-another/diagram/graphs/contributors)
[![AI-native](https://img.shields.io/badge/AI--native-%E2%9C%93-7c3aed.svg)](https://github.com/oh-just-another/diagram#readme)

**Status: in active development.**

## Quick start (for contributors)

```bash
pnpm install     # installing dependencies
pnpm build       # building all packages
pnpm test        # tests
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm format      # prettier --write .
```

Run the editor in the browser:

```bash
pnpm --filter @oh-just-another/diagram dev   # http://localhost:5174
```

Use as a component in your project:

```tsx
import { Diagram } from "@oh-just-another/diagram";

function App() {
  return <Diagram />;
}
```

`<Diagram>` automatically selects the best renderer (WebGL2 / OffscreenCanvas / Canvas2D), loads WASM-shaper for text where supported, and logs the actual profile to console.log on mount.

Create a new package:

```bash
pnpm new-package <name>          # → packages/<name>
pnpm new-package <name> --app    # → apps/<name>
```

## Structure

```
packages/   — publishable npm packages (L0–L5)
apps/       — applications: demo, cli (L6)
scripts/    — utility scripts (package generator)
```

## License

MIT (TBD).
