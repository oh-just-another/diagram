# Oh, just another diagram library!

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

## Documentation

Docs and a live, in-browser editor demo: **<https://ohjustanother.site>**

## Use in your app

```bash
pnpm add @oh-just-another/editor react react-dom
```

```tsx
import { Editor } from "@oh-just-another/editor";
import "@oh-just-another/react-ui/styles.css"; // styles the toolbar, panels, menus

function App() {
  return <Editor style={{ position: "fixed", inset: 0 }} />;
}
```

`<Editor>` auto-selects the best renderer (WebGL2 / OffscreenCanvas / Canvas2D),
loads a WASM text-shaper where supported, and exposes a programmatic handle via
`ref`. (`Diagram` is a back-compat alias of `Editor`.)

## Quick start (for contributors)

```bash
pnpm install     # install dependencies
pnpm build       # build all packages
pnpm test        # tests
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm format      # prettier --write .
```

Run the demo in the browser:

```bash
pnpm --filter @oh-just-another/diagram dev   # http://localhost:5174
```

## Structure

```
packages/   — publishable npm packages (L0–L5)
apps/       — applications: demo, cli (L6)
scripts/    — utility scripts (package generator)
```

## License

MIT — see [LICENSE](./LICENSE).
