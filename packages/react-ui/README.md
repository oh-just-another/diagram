# @oh-just-another/react-ui

React 18+ wrappers around the editor — `DiagramCanvas`, `Toolbar`, `Palette`, `PropertyPanel`, plus a small set of hooks. Mount it with three lines of JSX, customize with hooks for everything else.

## Install

```bash
pnpm add @oh-just-another/react-ui react react-dom
```

`react` and `react-dom` are peer dependencies (any version ≥ 18 works).

## Quick start

```tsx
import { emptyScene } from "@oh-just-another/scene";
import { DiagramCanvas, Toolbar, Palette, PropertyPanel } from "@oh-just-another/react-ui";
import { installBuiltinTemplates, loadTemplateLibrary } from "@oh-just-another/templates";

installBuiltinTemplates();

export const App = () => (
  <DiagramCanvas initialScene={emptyScene()} initialMode="select">
    <Toolbar />
    <Palette />
    <PropertyPanel />
  </DiagramCanvas>
);
```

`DiagramCanvas` constructs the underlying `Editor` and supplies it to every descendant via context. Toolbar / Palette / PropertyPanel are independent — drop them anywhere in the subtree, layered with normal CSS.

## API

| Name                                                           | Purpose                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DiagramCanvas` / `DiagramCanvasProps`                         | Mounts a host element, instantiates `Editor`, wraps children in `DiagramProvider`.        |
| `DiagramProvider` (+ `useDiagramContext`)                      | Standalone provider for advanced hosts that build their own editor.                       |
| `useDiagram()`                                                 | Live `Editor`. Imperative access (no re-render on change).                                |
| `useScene()` / `useSelection()` / `useMode()` / `useHistory()` | Reactive slices. `useHistory` exposes `canUndo` / `canRedo` + `undo` / `redo`.            |
| `useEditorSelector(select)`                                    | Build your own selector — re-renders when the projected value changes.                    |
| `Toolbar` / `DEFAULT_TOOLBAR` / `ToolbarItem`                  | Items: `mode`, `action`, `divider`, `undo`, `redo`. Action items receive the live editor. |
| `Palette` / `PaletteProps`                                     | Drag-and-drop catalog of templates. Defaults to `defaultRegistry`.                        |
| `usePaletteDropHandler()`                                      | Convert an HTML5 drop event on any element into `editor.addShape(template.factory(...))`. |
| `PropertyPanel` / `PropertyPanelProps`                         | Read-only inspector for the current selection.                                            |

## Design notes

- **`<DiagramCanvas>` owns the editor's lifetime.** Created in `useLayoutEffect` so children's effects see the provider value on first paint; disposed on unmount. `initialScene` and `initialMode` are read once — runtime updates go through the editor API (`editor.loadScene`, `editor.setMode`).
- **Hooks subscribe via the editor's `subscribe`.** Mode changes were previously not announced; `Editor.setMode` now calls `notify()` so `useMode` (and similar bespoke selectors) re-render correctly.
- **No global state.** Every editor instance is independent — composition via context lets multiple canvases live on the same page (useful for diff viewers, presentation modes).
- **Toolbar item kinds are a discriminated union.** Hosts can mix builtin `mode` / `undo` / `redo` items with arbitrary `action` items in one declarative array.
- **Palette uses SVG icons through `dangerouslySetInnerHTML`.** Template authors define the icon markup; same SVG goes through the canvas renderer's SVG-parser (Phase 6b). No cross-package surprises.
- **Tests run under `jsdom`.** `tests/setup.ts` stubs `HTMLCanvasElement.prototype.getContext`, pointer-capture, and `ResizeObserver` — enough for the editor to mount without pulling the native `canvas` npm package.
