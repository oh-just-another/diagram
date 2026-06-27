# @oh-just-another/templates-jsx

[![npm version](https://img.shields.io/npm/v/@oh-just-another/templates-jsx.svg)](https://www.npmjs.com/package/@oh-just-another/templates-jsx)

JSX sugar over `@oh-just-another/templates` rich-template node trees.

An `h()` pragma and JSX runtime that build plain `rich.TemplateNode` trees — no DOM, no virtual DOM. Output is consumed as-is by the templates package's layout / render / hit-test. Depends only on `@oh-just-another/templates` (types).

## Install

```bash
pnpm add @oh-just-another/templates-jsx @oh-just-another/templates
```

To enable JSX in a host project, set in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@oh-just-another/templates-jsx"
  }
}
```

## Quick start

```tsx
import { bind, tsx2json } from "@oh-just-another/templates-jsx";

const node = (
  <container layout={{ direction: "column", gap: 8 }}>
    <text>{bind("title")}</text>
    <button action="submit" label="OK" />
  </container>
);

const json = tsx2json(node); // plain rich.TemplateNode tree
```

## API

| Name                                                                                                 | Purpose                                                   |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `h`, `Fragment`                                                                                      | Pragma + fragment marker (the JSX runtime targets these). |
| `bind(key)`                                                                                          | `{ bind: key }` data-binding shortcut for use in JSX.     |
| `tsx2json(node)`                                                                                     | Materialise a JSX tree into a `rich.TemplateNode`.        |
| `ContainerProps`, `TextProps`, `IconProps`, `ImageProps`, `ButtonProps`, `DropZoneProps`, `JsxChild` | Element prop types.                                       |
