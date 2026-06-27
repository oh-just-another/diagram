<div alt style="text-align: center;">
	<picture>
		<source media="(prefers-color-scheme: dark)" srcset="https://github.com/oh-just-another/diagram/raw/master/assets/github-hero-dark.png" />
		<img alt="diagram" src="https://github.com/oh-just-another/diagram/raw/master/assets/github-hero-light.png" />
	</picture>
</div>

<!-- Badges track the drop-in package, @oh-just-another/editor. -->

[![npm version](https://img.shields.io/npm/v/@oh-just-another/editor.svg)](https://www.npmjs.com/package/@oh-just-another/editor)
[![CI](https://github.com/oh-just-another/diagram/actions/workflows/ci.yml/badge.svg)](https://github.com/oh-just-another/diagram/actions/workflows/ci.yml)
[![install size](https://packagephobia.com/badge?p=@oh-just-another/editor)](https://packagephobia.com/result?p=@oh-just-another/editor)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/@oh-just-another/editor)](https://bundlephobia.com/package/@oh-just-another/editor)
[![npm downloads](https://img.shields.io/npm/dm/@oh-just-another/editor.svg)](https://www.npmjs.com/package/@oh-just-another/editor)
[![types included](https://img.shields.io/npm/types/@oh-just-another/editor.svg)](https://www.npmjs.com/package/@oh-just-another/editor)
[![license](https://img.shields.io/npm/l/@oh-just-another/editor.svg)](./LICENSE)
[![contributors](https://img.shields.io/github/contributors/oh-just-another/diagram.svg)](https://github.com/oh-just-another/diagram/graphs/contributors)
[![AI-native](https://img.shields.io/badge/AI--native-%E2%9C%93-7c3aed.svg)](https://github.com/oh-just-another/diagram#readme)

### Library for drawing diagrams: browser editor + headless-render for servers.

> [!WARNING]
> In active development!

## Documentation

Docs and a live, in-browser editor demo: **<https://ohjustanother.site>**

## Use in your app

```bash
pnpm add @oh-just-another/editor react react-dom
```

```tsx
import { Editor } from "@oh-just-another/editor";
import "@oh-just-another/react-ui/styles.css";

export default function Diagram() {
  return <Editor style={{ position: "fixed", inset: 0 }} />;
}
```

## License

MIT — see [LICENSE](./LICENSE).
