# @oh-just-another/cli

Command-line interface for headless diagram rendering. Thin wrapper around `@oh-just-another/headless`.

## Install

```bash
pnpm install -D @oh-just-another/cli
pnpm add @resvg/resvg-js   # PNG only — optional
```

The package installs a `diagram` bin.

## Usage

```bash
diagram render scene.json --out scene.svg
diagram render scene.json --out scene.png --scale 2
diagram render scene.json --out preview.png --width 1920 --background "#fafafa"
diagram --help
```

The output format is inferred from the `--out` extension:

| Extension | Backend                 | Notes                  |
| --------- | ----------------------- | ---------------------- |
| `.svg`    | `@renderer-svg`         | Synchronous, pure JS.  |
| `.png`    | `@renderer-svg` + resvg | Async, requires resvg. |

## Options

| Flag                 | Where it applies | Default                               |
| -------------------- | ---------------- | ------------------------------------- |
| `--out`, `-o FILE`   | required         | —                                     |
| `--width N`          | SVG + PNG        | `scene.viewport.size.width` or `800`  |
| `--height N`         | SVG + PNG        | `scene.viewport.size.height` or `600` |
| `--scale N`          | PNG              | `1`                                   |
| `--background COLOR` | PNG              | `#ffffff`                             |
| `--help`, `-h`       | —                | —                                     |

## Programmatic use

The same logic is exported as a function for tests and scripts:

```ts
import { run } from "@oh-just-another/cli";
await run(["render", "scene.json", "--out", "scene.svg"]);
```

