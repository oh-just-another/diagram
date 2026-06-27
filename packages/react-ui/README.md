# @oh-just-another/react-ui

[![npm version](https://img.shields.io/npm/v/@oh-just-another/react-ui.svg)](https://www.npmjs.com/package/@oh-just-another/react-ui)

React 18+ wrappers around the editor — `DiagramCanvas`, `Toolbar`, `Palette`, `PropertyPanel`, plus a small set of hooks. Mount it with three lines of JSX, customize with hooks for everything else.

The React binding layer (L5) over `@oh-just-another/state`; needs React + DOM. For a single drop-in component, use `@oh-just-another/editor`.

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

## Components

Every component reads the editor from context, so most take no required props.

### Mounting & layout

| Name                             | Purpose                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `DiagramCanvas`                  | Mounts a host element, instantiates `Editor`, provides context.  |
| `DiagramRoot` / `DiagramSurface` | Lower-level split of the canvas: provider root + render surface. |
| `DiagramProvider`                | Standalone provider for hosts that build their own editor.       |
| `UILayer`                        | Positioned overlay layer for placing chrome over the canvas.     |
| `TopBar` / `BottomBar`           | Edge-anchored bars for toolbars and status chrome.               |
| `Sidebar`                        | Collapsible side container for panels.                           |
| `BottomSheet`                    | Sliding bottom container (touch / mobile layouts).               |

### Toolbar & zoom

| Name                                                                                     | Purpose                                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Toolbar` / `DEFAULT_TOOLBAR` / `DEFAULT_VERTICAL_TOOLBAR`                               | Declarative tool/action bar. Items: `mode`, `action`, `divider`, `undo`, `redo`. |
| `openImageFilePicker`                                                                    | Opens the OS file picker and inserts the chosen image.                           |
| `ZoomWidget` / `FloatingZoomControls`                                                    | Composite zoom controls.                                                         |
| `ZoomInButton` / `ZoomOutButton` / `ResetZoomButton` / `ZoomToFitButton` / `ZoomDisplay` | Individual zoom controls.                                                        |
| `ResetToContentButton`                                                                   | Recenters the viewport on scene content.                                         |

### Palettes & shape catalog

| Name                                                                                              | Purpose                                            |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `Palette`                                                                                         | Drag-and-drop catalog of templates.                |
| `LibraryPanel`                                                                                    | Browsable template library panel.                  |
| `ColorSwatchPicker`                                                                               | Color swatch grid picker.                          |
| `ELEMENT_PALETTE_LIGHT` / `ELEMENT_PALETTE_DARK` / `CANVAS_PALETTE_LIGHT` / `CANVAS_PALETTE_DARK` | Built-in color palettes.                           |
| `resolvePaletteTheme`                                                                             | Picks the light/dark palette for the active theme. |

### Inspectors & property panels

| Name                     | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `PropertyPanel`          | Inspector for the current selection.         |
| `LinkStylePanel`         | Edge/link styling controls.                  |
| `LayerPanel`             | Layer list with visibility / ordering.       |
| `FramePanel`             | Frame list and controls.                     |
| `SelectionFloatingPanel` | Floating controls anchored to the selection. |

### Menus, dialogs & overlays

| Name                                   | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| `MainMenu`                             | Top-level application menu with submenus.          |
| `ContextMenu` / `DEFAULT_CONTEXT_MENU` | Right-click menu over the canvas.                  |
| `CommandPalette`                       | Searchable command launcher.                       |
| `Modal` / `Popover`                    | Generic modal dialog and anchored popover.         |
| `Tooltip` / `TooltipProvider`          | Hover tooltips (wrap the subtree in the provider). |
| `HelpButton` / `HelpDialog`            | Keyboard-shortcut / help dialog and its trigger.   |
| `ToastHost`                            | Renders transient toasts; pair with `useToast`.    |

### Collaboration & versioning

| Name                                | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `CommentsPanel` / `CommentsPopover` | Thread list and anchored comment popover. |
| `VersionPanel`                      | Snapshot history browser.                 |
| `MergeDialog`                       | Resolve conflicts when merging versions.  |
| `DiffPanel`                         | Visual diff between two scenes.           |

### Editing overlays

| Name                                                         | Purpose                                |
| ------------------------------------------------------------ | -------------------------------------- |
| `TextEditorOverlay` / `FrameNameEditorOverlay`               | In-place text editors over the canvas. |
| `LinkHoverPopup` / `LinkDropShapeMenu` / `LinkCaptionEditor` | Link interaction overlays.             |
| `Markdown`                                                   | Renders markdown (comments, captions). |

### Primitives

| Name                          | Purpose                            |
| ----------------------------- | ---------------------------------- |
| `IconButton` / `ButtonGroup`  | Buttons and grouped button rows.   |
| `SegmentedControl` / `Slider` | Segmented toggle and range slider. |

## Hooks

| Name                                                                     | Purpose                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `useDiagram()` / `useDiagramOptional()`                                  | Live `Editor` (imperative; no re-render on change).            |
| `useDiagramContext()` / `useDiagramContextOptional()`                    | Raw context value.                                             |
| `useEditorSelector(select)`                                              | Custom selector — re-renders when the projected value changes. |
| `useScene()` / `useSelection()` / `useMode()`                            | Reactive slices of editor state.                               |
| `useHistory()`                                                           | `canUndo` / `canRedo` + `undo` / `redo`.                       |
| `useLayers()` / `useActiveLayerId()`                                     | Layer list and active layer.                                   |
| `useAnnotations()` / `useSelectedAnnotation()` / `useSelectedLink()`     | Annotation and link selection state.                           |
| `useMobileLayout()`                                                      | Whether the compact / touch layout is active.                  |
| `useToast()` / `useToastOptional()` / `useEphemeralToast()`              | Toast API (pair with `ToastHost`).                             |
| `useSnapshotStore()`                                                     | Snapshot store backing `VersionPanel`.                         |
| `useHelpDialogHotkey()`                                                  | Wires the help-dialog hotkey.                                  |
| `useContextMenuController()` / `ContextMenuControllerProvider`           | Imperative control of `ContextMenu`.                           |
| `usePaletteDropHandler()` / `usePalettePlacement()` / `usePaletteDrag()` | Palette drop / placement / drag wiring.                        |
| `getActivePaletteDrag()` / `subscribePaletteDrag()`                      | Read/observe the active palette drag outside React.            |

## Layout constants

Tunable sizes for the built-in panels and toolbar:
`PALETTE_WIDTH`, `PALETTE_ITEM_SIZE`, `PROPERTY_PANEL_WIDTH`, `PROPERTY_SWATCH_SIZE`,
`LAYER_PANEL_WIDTH`, `LAYER_TOGGLE_ICON_SIZE`, `LAYER_SWATCH_SIZE`,
`COMMENTS_PANEL_WIDTH`, `TOOLBAR_SEPARATOR_HEIGHT`.

Each component also exports its `*Props` type (e.g. `ToolbarProps`, `PaletteProps`); menu, toast,
help, and context-menu modules additionally export their item/section types (`ToolbarItem`,
`ContextMenuItem`, `ToastKind`, `HelpRow`, etc.).

## Design notes

- **`<DiagramCanvas>` owns the editor's lifetime.** Created in `useLayoutEffect` so children's effects see the provider value on first paint; disposed on unmount. `initialScene` and `initialMode` are read once — runtime updates go through the editor API (`editor.loadScene`, `editor.setMode`).
- **Hooks subscribe via the editor's `subscribe`.** `Editor.setMode` calls `notify()` so `useMode` (and similar bespoke selectors) re-render on mode changes.
- **No global state.** Every editor instance is independent — composition via context lets multiple canvases live on the same page (useful for diff viewers, presentation modes).
- **Toolbar item kinds are a discriminated union.** Hosts can mix builtin `mode` / `undo` / `redo` items with arbitrary `action` items in one declarative array.
- **Palette uses SVG icons through `dangerouslySetInnerHTML`.** Template authors define the icon markup; the same SVG goes through the canvas renderer's SVG parser, so palette and canvas stay visually identical.
- **Tests run under `jsdom`.** `tests/setup.ts` stubs `HTMLCanvasElement.prototype.getContext`, pointer-capture, and `ResizeObserver` — enough for the editor to mount without pulling the native `canvas` npm package.
