# @oh-just-another/react-ui

## 0.64.7

### Patch Changes

- Updated dependencies [47221cc]
  - @oh-just-another/scene@0.64.0
  - @oh-just-another/state@0.69.0
  - @oh-just-another/renderer-canvas@0.62.7
  - @oh-just-another/renderer-core@0.62.3
  - @oh-just-another/renderer-svg@0.58.7
  - @oh-just-another/templates@0.59.4
  - @oh-just-another/versioning@0.57.9

## 0.64.6

### Patch Changes

- Updated dependencies [4dbd4d8]
  - @oh-just-another/state@0.68.1

## 0.64.5

### Patch Changes

- Updated dependencies [c199ecc]
  - @oh-just-another/state@0.68.0

## 0.64.4

### Patch Changes

- Updated dependencies [20fc326]
  - @oh-just-another/scene@0.63.2
  - @oh-just-another/renderer-canvas@0.62.6
  - @oh-just-another/renderer-core@0.62.2
  - @oh-just-another/renderer-svg@0.58.6
  - @oh-just-another/state@0.67.4
  - @oh-just-another/templates@0.59.3
  - @oh-just-another/versioning@0.57.8

## 0.64.3

### Patch Changes

- Updated dependencies [40cdc3b]
  - @oh-just-another/renderer-core@0.62.1
  - @oh-just-another/renderer-svg@0.58.5
  - @oh-just-another/renderer-canvas@0.62.5
  - @oh-just-another/state@0.67.3
  - @oh-just-another/templates@0.59.2

## 0.64.2

### Patch Changes

- f293c80: Sticky reaction chrome (pills and the "+" button) now hides by on-screen size instead of a fixed zoom: `STICKY_REACTION_MIN_SCREEN_PX` (80 px on the note's shorter side) replaces `STICKY_REACTION_MIN_ZOOM`, and `stickyReactionChromeVisible(shape, zoom)` is exported for hosts. A large note keeps its reactions at a zoom where a small one already hides them; the click-zone overlay follows per note.
- Updated dependencies [f293c80]
  - @oh-just-another/renderer-core@0.62.0
  - @oh-just-another/renderer-canvas@0.62.4
  - @oh-just-another/renderer-svg@0.58.4
  - @oh-just-another/state@0.67.2
  - @oh-just-another/templates@0.59.1

## 0.64.1

### Patch Changes

- 199e270: Accessibility: palette items are focusable (`tabIndex=0`), named `<name>, <hint>, draggable` and place their shape on Enter / Space; the selection toolbar is a `role="toolbar"` named "Selection" with an `aria-describedby` summary of a multi-selection (`describeSelection`).
- Updated dependencies [7f26f79]
- Updated dependencies [4aec396]
- Updated dependencies [bb878d3]
  - @oh-just-another/scene@0.63.1
  - @oh-just-another/state@0.67.1
  - @oh-just-another/templates@0.59.0
  - @oh-just-another/renderer-canvas@0.62.3
  - @oh-just-another/renderer-core@0.61.3
  - @oh-just-another/renderer-svg@0.58.3
  - @oh-just-another/versioning@0.57.7

## 0.64.0

### Minor Changes

- 000e777: Undo / redo buttons in the bottom bar, left of the zoom controls: `HistoryControls` (react-ui) disables each side when its stack is empty or in read-only mode; the `Editor` mounts it by default, `hideHistoryControls` removes it.

## 0.63.3

### Patch Changes

- Updated dependencies [0846934]
  - @oh-just-another/scene@0.63.0
  - @oh-just-another/state@0.67.0
  - @oh-just-another/renderer-canvas@0.62.2
  - @oh-just-another/renderer-core@0.61.2
  - @oh-just-another/renderer-svg@0.58.2
  - @oh-just-another/templates@0.58.2
  - @oh-just-another/versioning@0.57.6

## 0.63.2

### Patch Changes

- Updated dependencies [8f0ec5d]
- Updated dependencies [6924e11]
- Updated dependencies [fc09e7c]
  - @oh-just-another/renderer-core@0.61.1
  - @oh-just-another/state@0.66.0
  - @oh-just-another/renderer-canvas@0.62.1
  - @oh-just-another/renderer-svg@0.58.1
  - @oh-just-another/templates@0.58.1

## 0.63.1

### Patch Changes

- Updated dependencies [e28d529]
  - @oh-just-another/state@0.65.0

## 0.63.0

### Minor Changes

- c738f81: Multi-selection and group toolbars follow the reference. Every element type declares an ordered control set for single and multi selections (`panels/control-sets.ts`); a selection of two or more elements shows the intersection of the members' multi sets — two shapes keep the shape controls minus the link, a shape + a text share the text controls, a shape + a frame share nothing — and mixed types keep the Filter. The shared tail gains an **Arrange** popover (align left / centre / right / top / middle / bottom, distribute from three) and **Group** / **Ungroup** buttons driven by the action registry; the comment button is single-selection only. A selected group stands for its leaf children (their shared controls, writes to them), shows Ungroup instead of Group and keeps align / distribute disabled while it is the only thing selected; editing inside a group (double-click) hides Group / Ungroup. Text controls no longer take a `labelMode` prop — they write through the label-aware `Editor.updateTextStyle` / `updateTextProps`.

### Patch Changes

- Updated dependencies [c738f81]
  - @oh-just-another/state@0.64.0

## 0.62.0

### Minor Changes

- c989c1c: Canvas context menu (right-click on empty canvas): Paste, Unlock all, Add text / Add sticky note / Add comment, Set start view / Set current view as start, check rows for Show grid, Snap to grid, Snap objects, Show object size, Suggest object size, a "Mouse or trackpad" radio submenu, and Show all. `ContextMenuItem` actions gain `checked` (rendered as a leading check mark, `role="menuitemcheckbox"`). `<Diagram persistPreferences>` keeps `EditorPreferences` in `localStorage` (`bindPreferencesPersistence` / `loadPreferences` exported for hand-composed shells).
- 76463dd: Sticky reaction pills and the "+" add-reaction button are now painted by the canvas renderer (single visual source that tracks the shape 1:1 while dragging; pills also reach PNG / SVG exports); the DOM overlay only lays transparent click zones over the same rects (`stickyReactionLayout`) and hosts the emoji picker. Pills keep a constant on-screen size across zoom (low-zoom clamp `STICKY_REACTION_MIN_ZOOM`) and wrap onto new rows inline-block style instead of being dropped. The "+" button is hover-only chrome: shown for the sticky under the idle cursor (`Editor.hoveredStickyId` → `RenderSceneOptions.hoveredElement`), excluded from exports and read-only views. Static exports gained content switches (`RenderSceneOptions.content`, defaults in `EXPORT_CONTENT_DEFAULTS`) toggling sticky reactions / tags / author, wired to "Include in export" checkboxes in the Export… menu and to `downloadPng` / `downloadSvg` / `exportSceneToPng`.
- bb08cc6: Every chrome control is now 40px — grouped toolbar buttons, the selection floating panel, panel headers, dialog and sidebar buttons — matching the menu row height (`--du-button-size-sm` is an alias of `--du-control-size`). Glyphs scale with them through shared icon presets exported from `@oh-just-another/react-ui`: `CONTROL_ICON` (20px, inside controls), `ROW_ICON` (16px, menu / list rows), `MARK_ICON` (14px checks / chevrons), `BADGE_ICON` (12px chips). Inputs grow to 36px, small inline controls to 28px, colour swatches to 32px, help-dialog key pills to 24px.
- ef7a237: `ContextMenuItem` gains a `submenu` kind (nested panel opened on hover / click). The selection section of the context menu is regrouped into three submenus — Arrange (z-order, flip), Align (edge / centre alignment, distribute) and Layout (grid, stacks, auto-arrange) — and the z-order group leaves the selection toolbar.
- 8233dd1: Design tokens for the static chrome. The `:root` block of `styles.css` is now one documented token sheet grouped by type — colour (surfaces, text, accent, inverse), elevation, radius, spacing scale, control sizing, typography, layout (`--du-bar-height`, `--du-bar-clear`, `--du-side-panel-w`), menus, popovers, modals, toasts, tooltip, z-index scale and motion. Every hard-coded value in the mode toolbars, zoom controls, minimap, top bars, help / merge dialogs, `Modal`, `Toast`, `Tooltip`, `BottomSheet` and the tool-options dock now reads a token; their inline styles moved to classes (`du-modal-title/-subtitle/-close/-footer`, `du-toast*`, `du-sheet-*`, `du-minimap-dock`, `du-tool-options-dock`, `du-zoom-*`, `du-toolbar-divider`, `du-brand`). Removed the unused `TOOLBAR_SEPARATOR_HEIGHT` export — the separator height is `--du-icon-size`.
- 10eac46: Drop overlay: while an OS file is dragged over the canvas the editor shows a dashed frame, a drop glyph with "DROP" and a chip per accepted file kind. `FileDropHandler` gains presentation metadata — `label`, `kind` (`image` · `video` · `scene` · `text` · `data` · `file`) and `formats` — the built-in image and video handlers ship theirs; `Editor.getFileDropHandlers()` lists the registry. New `FileDropOverlay` component and `usePalettePlacement({ onFileDrag })` for hosts composing their own canvas.
- a6fe14d: Frame size presets. The frame toolbar gained a size-preset dropdown (A4, Letter, 16:9, 4:3, 1:1, Phone, Tablet, Browser — `FRAME_SIZE_PRESETS`, applied via the new `Editor.applyFramePreset`).
- e2ff8df: Image file tools. The image toolbar (single selection) gained a file-name input (renames the backing `BinaryFile`, undoable), Replace image (swaps the bytes while keeping position / size / crop), Download (original bytes with stored name / mime) and an Alt-text editor backed by the new `ImageElement.alt` field (serialized; surfaced to hosts for accessibility). New editor APIs: `renameBinaryFile`, `setImageAlt`, `replaceImageFile`.
- 5f08d13: Image shape masks: `ImageElement.mask` clips the drawn box to an ellipse, rounded rect (normalised `radius`) or arbitrary normalised polygon (presets in `IMAGE_MASK_POLYGON_PRESETS`), applied after `crop` and reaching every backend and PNG / SVG exports through the new `RenderTarget.clip`. `Editor.setImageMask(ids, mask | null)` sets/clears it (undoable); the image toolbar gained a mask picker next to Crop: aspect presets (Custom / Original / Circle / Square / Portrait / Landscape / Wide via `Editor.setImageAspectPreset` — centre-crop to the ratio, box refit, Circle adds an ellipse mask) plus shape tiles with a corner-radius slider.
- 1a9bf66: Elements carrying a safe `href` now show a persistent link badge at their top-right corner (new `LinkBadges` overlay, mounted by the editor shell). Clicking the badge opens the link; the hover popup and Cmd/Ctrl-click behaviour are unchanged. Badges track pan/zoom and also render in read-only mode.
- 350c6d3: Locked elements are now click-through: the pointer hit-test skips locked (and hidden) shapes and picks whatever lies beneath, instead of letting them shadow the shapes below. Locking a selection drops it. Unlocking moved to the right-click context menu ("Unlock", backed by the new `Editor.lockedElementAt` / `Editor.unlockElement`), and the selection toolbar gained a Lock button plus a "Lock" context-menu entry. `getElementAt` / `getElementAtIndexed` accept an optional `accept` predicate that skips rejected shapes and keeps scanning beneath them.
- b90174d: One spacing system for every menu surface. New `--du-menu-*` tokens (panel padding 6, min-width 220, row height 36 = button size, row padding 10, icon / check gutter 20, gap 8, font 13 / shortcut 11, separator 6) and `--du-modal-*` tokens (16×20 padding, radius 14, gap 12), with shared `.du-menu-panel` / `.du-menu-row` / `.du-menu-gutter` / `.du-menu-shortcut` / `.du-menu-sep` / `.du-menu-group-title` / `.du-modal-header` / `.du-modal-body` classes. The context menu, `MainMenu` (main and zoom menus), the Shapes and lines flyout, popover list rows and the Help dialog all use them, so rows, gutters and separators line up across the UI. The zoom-percentage trigger is flat like its neighbours.
- 6ca5ec9: Minimap: a schematic overview — white paper with every element's box in the system accent colour (no renderer pass) — that repaints only when the editor goes idle (`MINIMAP_IDLE_MS`): never during element drags, pans, pinches or wheel bursts, and once right after. `MINIMAP_THROTTLE_MS` is replaced by `MINIMAP_IDLE_MS`, `MINIMAP_BACKGROUND`, `MINIMAP_ELEMENT_COLOR`, `MINIMAP_ELEMENT_OPACITY`.
- 5ffb5cc: Mixed-type selections now follow the reference behaviour: the floating toolbar SHRINKS to the shared actions (z-order / align / duplicate / comment / lock) instead of showing per-type controls, and gains a Filter popover listing the selection's type buckets (Shapes / Sticky notes / Text / Images / Frames / Drawings / Emoji) with counts — picking one narrows the ACTUAL selection to that bucket, after which the full per-type toolbar returns.
- 26abd0c: `LayerPanel`, `CommentsPanel`, `CommentsPopover` and `Sidebar` drop their inline legacy styles for the shared side-panel chrome: `du-side-panel du-side-panel-static` cards, 40-px `du-panel-row` list rows with the menu hover / tonal selected states, `du-panel-input`, the new `du-button` / `du-button-primary` text button (also used by the merge dialog footer and sidebar tabs), and `du-thread*` for the floating thread. Icon glyphs replace the `+` / `×` / `⌄` text buttons. Sizes moved to CSS tokens (`--du-sidebar-w`, `--du-thread-w`, `--du-panel-row-h`); the `LAYER_PANEL_WIDTH`, `LAYER_TOGGLE_ICON_SIZE`, `LAYER_SWATCH_SIZE`, `COMMENTS_PANEL_WIDTH` exports are removed.
- 4df12dd: Style tokens aligned with the reference: radii 4 (items) / 8 (toolbars, dropdowns) / 12 (panels, dialogs); one elevation shadow for every floating surface; typography tokens `--du-font-size` 14 / `--du-font-size-sm` 12 / `--du-line-height` 20 used throughout; 40-px tool buttons with 4-px item radius inside 8-px groups; 16-px screen inset; menu rows 44 px high with 16-px padding, 24-px icon gutter and 240-px panels. The minimap container uses the same tokens.
- 745d7a9: Embedded shape labels and grouped style controls. Rectangles, ellipses, polygons and block arrows can now carry text inside their body (`ElementBase.label` — full text stack: wrapping, styled runs, lists, highlight; centered by default with `textAlign` / `textBaseline` overrides). Double-click opens the same inline editor text elements use (typing, caret, selection, Tab-nesting all work; an emptied label is stripped on commit). Labels render on every backend and serialize. The wire schema also gained the element-level `locked` / `hidden` flags that previously failed strict validation. The shape toolbar now groups border editing (color / width / dash / corners) and fill (color / opacity) into two popovers.
- 67b98bb: "Shapes and lines" toolbar button (reference behaviour): replaces the separate rectangle / ellipse / connector buttons with one trigger opening a flyout beside the toolbar — Line / Arrow / Elbow arrow (connector presets: routing + arrowhead, applied to new links AND the live preview via `Editor.armLineTool`), Rectangle / Oval / Rhombus / Triangle (`Editor.armShapeTool` — diamond and triangle draw as inscribed polygons through the same rubber-band gesture), and "More shapes" opening the template library (the standalone library toggle is gone from the dock — "More shapes" is now its only toolbar entry point; `hideLibraryButton` removes that row). Hotkeys R / O / L keep arming the stock tools; any tool switch resets the armed variant.
- 586b7ed: Sticky auto-fit text. New stickies start in Auto mode (`ShapeLabel.autoFit`): the rendered font size is derived — binary search over the shared text layout, memoized — so the text fills the card and scales with it. Picking an explicit size in the toolbar leaves Auto (reference behaviour); the "Auto" button in the font-size popover returns to it (`Editor.setLabelAutoFit`). The sticky toolbar branch also gained the label text controls (font family, size, style, alignment).
- d4c2c2f: Sticky notes and emoji elements. New plugin-style scene types: `sticky` (rounded card, background from `style.fill`, text via the shared embedded label with double-click editing, optional author-name strip) and `emoji` (single glyph at a given size). Both render on every backend, serialize through the custom-element schema, and are created from the shape library ("Sticky note" now produces a real sticky; new "Emoji" entry). The selection toolbar gained dedicated branches: sticky — S/M/L size presets, background color/opacity, Show-author toggle; emoji — a glyph picker. New editor APIs: `setStickySize`, `toggleStickyAuthor`, `setEmojiGlyph`.
- 24c33b3: Switch type now covers the full matrix: shape kinds (rectangle / ellipse / diamond) ↔ text ↔ sticky, any to any, bulk on multi-selection. The user text transplants between carriers (`TextElement.text` ↔ embedded `label`); converting INTO a sticky snaps the fill to the nearest colour of the new `STICKY_PALETTE` (a text's font colour never becomes the card colour); converting FROM a sticky drops its reactions / tags / author. The toolbar's type control gained Text and Sticky targets and now also appears for text and sticky selections.
- 0767227: Collapse the selection toolbar's "Switch type" segmented control into a single trigger that opens a menu of target kinds; the trigger shows the selection's current kind and always sits first in the toolbar.
- 993b46a: Text highlight color. New `TextStyle.highlight` paints a marker-style line-height stripe behind the glyphs on every backend, works per styled run (inline-edit range selection highlights just those characters) and round-trips through serialization. The text toolbar gained a Highlight control next to the text color.
- ef7388f: Text lists. Text elements gained per-paragraph attributes (`paragraphs`: bulleted / numbered kind + nesting level) that survive serialization. The layout engine indents list paragraphs, shrinks their wrap budget and keeps caret / click / selection geometry in lockstep; renderers draw derived markers ("•", auto-numbering per nesting level) on every backend. New editor APIs `setParagraphList` / `indentParagraphs` target the inline-edit selection's paragraphs while editing (whole element otherwise); typing keeps attributes aligned (Enter continues a list, deleting a line drops its attrs); Tab / Shift+Tab change nesting during editing. The text toolbar gained a two-row List dropdown (bulleted / ordered + indent ±).
- ea5c6a3: The text-alignment control is now a two-row dropdown: horizontal alignment (left/center/right → `textAlign`) over vertical alignment (top/middle/bottom → `textBaseline`).
- 31ace39: Selection toolbar and right-click context menu restructured to the target design. Toolbar branches now lead with their type cluster (shape: convert type → border → fill → link; text: font family → size → style → align → link → color) separated by dividers, and every branch shares the tail "z-order → align → actions → comment → lock → ⋯". New Comment button starts an annotation thread on the selected element. The context menu is regrouped into clipboard → styles → comments → z-order/layers (now with Bring forward / Send backward) → selection & arrange → lock → delete → viewport sections.
- d8bf8c1: Zoom menu: clicking the zoom percentage in the bottom bar opens a view menu — Enter / Exit full screen, Hide / Show minimap (`M`), Grid › (None / Dot grid / Line grid), an Object dimensions switch, Fit to screen and zoom presets (50 % … 2000 %). `Editor.setZoom(level)` sets an absolute zoom about the viewport centre. react-ui adds the `Switch` primitive, the `useFullscreen` hook, and `MainMenu` options `ariaLabel` / `placement` / `triggerClassName` / `triggerStyle` plus `MainMenu.Item` `trailing`. The `minimap` prop now seeds the runtime-toggleable minimap.

### Patch Changes

- f12caa8: "Back to content" jumps to the element nearest the camera instead of fitting the whole scene: new `Editor.revealNearestContent(padding = 80)` (pure `computeRevealNearest` / `nearestElementBounds` in `zoom-pan`) centres that element at the current zoom, zooming out only when it does not fit — a lone small shape is no longer blown up to full screen and a large board is no longer shrunk to a speck. `ResetToContentButton` calls it.
- b8f70d6: Brand cell of the top bar shows the product logo. New `logo` prop on `Diagram` (default: the built-in `BrandLogo`, also exported; `null` drops the cell). The light / dark artwork lives in `packages/editor/assets/logo.svg` and `logo-dark.svg`, inlined by `scripts/gen-logo.mjs` (`pnpm gen:logo`, part of `build`); CSS (`.du-brand-logo-light/-dark`, `--du-brand-h`) shows the variant matching the theme. The `⌗` glyph and the playground's "Diagram" heading are gone.
- a1ea1b2: The canvas surface no longer draws a focus outline (it appeared after clicks on the canvas edge).
- c26b729: Toolbars and menus now share one rhythm: `--du-control-size` (40px) is the toolbar button height, the menu row height (Shapes and lines flyout, context / main / zoom menus) and the panel list row height; `--du-chrome-pad` (4px) is both the inset of a toolbar button group and the inset around a menu's rows. Menu rows go from 44px to 40px and menu panels from 8px to 4px inner padding as a result.
- 9e12fca: The context menu drops the viewport entries (Zoom in / out / reset / Fit to screen) and Clear canvas — they duplicate the static zoom bar and main menu.
- ab5af20: The context menu stays inside the window: it flips above the press point when there is no room below, keeps `MENU_VIEWPORT_PADDING_PX` from every edge, and scrolls when the window is shorter than the menu. Submenus open to the left when the right side has no room and are clamped the same way. Positioning is shared with `Popover` through the new `floatPanel` helper.
- 2e9c5c5: The context menu (and its submenus) now stack above every toolbar, floating panel and popover (`--du-z-context-menu`, 1700).
- 66481cd: Context menu rows "Copy as PNG", "Copy as SVG" and "Copy as text" copy the selection to the clipboard (transparent retina PNG; fitted SVG markup as text; text / labels one per line). New editor exports `copySelectionAsPng` / `copySelectionAsSvg` / `copySelectionAsText`, `selectionText`, `sceneToSvgMarkup`, `subsetScene`, `sceneBounds`, `fitViewportTo`, registered as `copy-as-png` / `copy-as-svg` / `copy-as-text` actions. The react-ui context menu shows the rows when the host registered those actions.
- 2105693: Crisp glyphs: icon presets moved to pixel-aligned lucide sizes — `CONTROL_ICON` 24 / 2 (the native grid, 2-px strokes), `ROW_ICON` and `MARK_ICON` 16 / 1.5 (1-px strokes), `BADGE_ICON` 12 / 2; `--du-icon-size` is 24. The vertical tool dock now sits on a whole-pixel offset (`top: round(50%, 1px); translate: 0 round(-50%, 1px)` on the new `.du-dock` wrapper) instead of a `translateY(-50%)` that landed on half pixels whenever the free space was odd and blurred every glyph in the dock.
- 3e5d81f: Floating chrome appears in place, instantly: `floatPanel` keeps a panel invisible until its first position resolves (menus, submenus, popovers no longer paint at the corner and jump), and the selection toolbar reveals with `visibility` instead of a fade. A library drag-to-place is now an element gesture — `Editor.placementId` is set from `beginPlacement` until commit / cancel — so the selection toolbar stays hidden and the minimap defers its repaint while the shape is being dragged in.
- b965236: The floating selection toolbar now hides for the duration of an element gesture (move / resize / rotate) and reappears `GESTURE_QUIET_MS` (200 ms) after it ends — per-frame floating-ui repositioning plus a full toolbar re-render was making dragged elements visibly lag.
- 2e2a9e7: Second review pass on shape labels and stickies. Label text is now strictly contained: when not even one line fits the padded body nothing paints outside the shape (no more tile artifacts after growing the font). Double-click places the caret at the click point instead of jumping to the (possibly clipped) text end. Cmd/Ctrl+A inside the inline editor is handled explicitly, removing a race with the selection mirror that made select-all intermittently need a second press. Labels are real rich text: styling with an active selection applies to just that range (styled runs) rather than the whole label. Stickies lost the folded corner (plain sheet with the bottom drop shadow), and emoji reactions became per-user toggles — your own click adds and then removes YOUR reaction (`toggleStickyReaction`, `reactions[].users`), so counters only grow through other collaborators.
- ab44aa8: The shape library list follows the menu rhythm: 40-px rows with the menu row padding / gap / font, section titles styled like `du-menu-group-title`, sections inset by `--du-menu-pad`.
- da647fc: The template library panel header now shows a "Shape library" title on the left (the close / import buttons stay on the right).
- 9b3bc01: `MainMenu` panels (root and nested) render through the portal container and position with `floatPanel`, like the context menu: they now stack at `--du-z-popover` above the selection floating toolbar and the minimap, flip / shift inside the viewport, and read their gaps (`--du-flyout-gap`, `--du-submenu-gap`) from the CSS tokens via the shared `cssPx` helper. Click-outside treats every open panel as inside the menu.
- 129c8b5: `MainMenu` submenus are coordinated per level: hovering a sibling submenu opens it and closes the previous one at once (no overlapping panels); hovering a plain item closes the open submenu after the short delay.
- f7cc2c0: `MainMenu.Item` gains `checked` — the row renders as `menuitemcheckbox` with a decorative trailing switch instead of nesting a `Switch` button inside the row button (invalid HTML, React warned on every open). `Switch` gains `presentational` for the same purpose.
- 64e97b9: Distance tokens for the chrome: `--du-dock-inset` (14px, canvas edge → vertical tool dock), `--du-flyout-gap` (14px, a bar → the menu / flyout it opens: Shapes and lines, main and zoom menus) and `--du-submenu-gap` (10px, parent menu column → nested menu). Nested menus no longer overlap their parent column after the tighter menu inset; the context-menu submenu reads its alignment from the live panel instead of a hard-coded 7px; the dock clears an open library by its real inset + width instead of a stale 12px constant.
- 0a4264b: Chrome distances tightened by 4px each (`--du-bar-inset` 12, `--du-dock-inset` 10, `--du-flyout-gap` 10, `--du-submenu-gap` 6). A nested main-menu panel now carries an invisible hover bridge over the gap to its parent column, so moving the pointer from the parent row into the child no longer closes it.
- 58c944b: The minimap's viewport frame follows a drag-pan: `Editor.endPanGesture` now notifies subscribers, so idle-gated observers that skip every notify while `panGesture` is set get the trailing change and repaint once the gesture ends.
- 3086875: Menu, submenu, flyout and list-row icons render on lucide's native 24-px grid (`ROW_ICON` 24 / 2) and marks on the half grid (`MARK_ICON` 12 / 2), so they are as crisp as the toolbar glyphs; the search-input glyph is 12 px. Dialogs stack above all floating chrome (`--du-z-modal` 1800, `--du-z-toast` 1900) — the selection toolbar no longer covers the Keyboard shortcuts dialog. The selection panel, popover and caption editor read their z-index from the tokens.
- 3f45f83: Chrome surfaces are opaque: `UI_SURFACE.bg` / `--du-ui-bg` drop the 0.95 alpha (`#ffffff` light, `#252525` dark), so toolbars and button groups no longer show the canvas grid through them. `bgSolid` / `--du-ui-bg-solid` now equal `bg`.
- 3b994bc: Segmented controls inside popovers (border width / style / corners, text style, …) are flat — no nested card background, border or shadow.
- 1bbb5f9: Canvas-anchored DOM overlays (link badges, sticky reaction bars) hide while the viewport is moving and reappear ~150 ms after it settles. Re-rendering them on every pan/zoom frame made React reconciliation a per-frame main-thread cost; with the render loop otherwise clean this was the last interaction-time hitch.
- b1e08de: "Replace image" is now "Replace media": `Editor.replaceImageFile` accepts GIFs and videos in addition to static images. The shape keeps its position and width (height refits to the new aspect — videos measure via a hidden looping `<video>`, same as the drop handler); animation fields (`animationKind` / `animationData` / `metadata.animated`) are rewritten to match the new media kind, and the crop resets when the media kind changes. The toolbar control's file picker accepts `image/*,video/*`.
- 8947a84: Menu / list row icons step down to 20 px (`ROW_ICON` 20 / 2, `--du-icon-size-sm` 20) — a size below the 24-px controls.
- 1abaca1: The selection toolbar groups its controls (`.du-sel-group`) and draws separators in CSS only between non-empty groups — no more doubled or stray dividers when an optional cluster (label text, crop, …) renders nothing for the selection. The `.du-sel-divider` element is gone.
- 7d15a0c: The Shapes and lines flyout marks the armed tool: the row matching the current shape kind or line preset is `menuitemradio` + `aria-checked` with the tonal selected style (stock `draw-edge` reads as Elbow arrow). `armShapeTool` / `armLineTool` notify subscribers once more after the variant is set, so listeners never observe the reset value.
- 8f8846b: The selection toolbar shows the text controls for every shape type that can carry text (rectangle, ellipse, polygon, block arrow, sticky) even before it has any — they display the defaults the first text will take. `updateLabelStyle` / `updateLabelProps` / `setLabelAutoFit` seed the label on a labelable shape that has none (create-on-write); the inline editor and the style APIs share one `seedLabel`.
- c22fb63: The selection toolbar drops the Align group and the Duplicate / Delete / Group / Ungroup actions — all of them live in the context menu (Align ›, and the top-level entries).
- 1b806ed: The selection toolbar no longer shows Flip horizontal / Flip vertical — they live in the context menu's Arrange submenu.
- 321c4a3: Toolbar action buttons and the zoom controls no longer re-render on every editor change: action buttons re-render only when their pressed/disabled state actually flips, and the zoom pill subscribes to the zoom value alone — a whole-editor subscription re-rendered them on every frame of an element drag.
- 8163681: First review pass on the toolbar redesign. Locked elements are no longer captured by marquee selection. Embedded shape labels clip to the shape's padded body (extra lines aren't painted), the inline-edit caret sits exactly on its line, and shapes with a label show the full set of text controls (font, size, style, alignment, color, highlight) writing through the new `updateLabelStyle` / `updateLabelProps`. Replacing an image refits the shape's height to the new file's aspect ratio, image resize never mirrors on overshoot, and the crop button matches the toolbar style. Sticky notes look like paper (drop shadow, folded corner), support tags (toolbar editor + on-card pills) and emoji reactions with counters via a bottom-left reaction bar (`StickyReactions` overlay, `setStickyTags` / `addStickyReaction`). The hide-frame feature was removed.
- Updated dependencies [98070d8]
- Updated dependencies [f12caa8]
- Updated dependencies [76463dd]
- Updated dependencies [2942fb9]
- Updated dependencies [d0eb799]
- Updated dependencies [e202058]
- Updated dependencies [e0e4ea9]
- Updated dependencies [d658680]
- Updated dependencies [e66a8a5]
- Updated dependencies [10eac46]
- Updated dependencies [3e5d81f]
- Updated dependencies [a6fe14d]
- Updated dependencies [06a0625]
- Updated dependencies [3ff16ab]
- Updated dependencies [09bc11a]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [3019bc7]
- Updated dependencies [2e2a9e7]
- Updated dependencies [f46e3da]
- Updated dependencies [350c6d3]
- Updated dependencies [58c944b]
- Updated dependencies [518a6d1]
- Updated dependencies [3f45f83]
- Updated dependencies [3543dc7]
- Updated dependencies [b1e08de]
- Updated dependencies [e6057d1]
- Updated dependencies [2cd199e]
- Updated dependencies [745d7a9]
- Updated dependencies [67b98bb]
- Updated dependencies [7d15a0c]
- Updated dependencies [59695d7]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [24c33b3]
- Updated dependencies [8f8846b]
- Updated dependencies [22c0f48]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [22ecd4b]
- Updated dependencies [8163681]
- Updated dependencies [97daf50]
- Updated dependencies [4c2b27b]
- Updated dependencies [d8bf8c1]
  - @oh-just-another/state@0.63.0
  - @oh-just-another/renderer-core@0.61.0
  - @oh-just-another/renderer-canvas@0.62.0
  - @oh-just-another/scene@0.62.0
  - @oh-just-another/tokens@0.58.1
  - @oh-just-another/renderer-svg@0.58.0
  - @oh-just-another/templates@0.58.0
  - @oh-just-another/versioning@0.57.5

## 0.61.0

### Minor Changes

- ac128db: Dark theme now restyles the chrome only — the canvas always stays light. Scene colors are raw hex authored against light paper, so a dark canvas silently broke user content; `UI_SURFACE.dark.canvas` and `--du-canvas-bg` are light in every theme, and the bundled color picker always offers the light element palette. Canvas-drawn chrome (selection, handles, anchors, marquee, badges, minimap frame) is unified on the iris accent (`CANVAS_CHROME_ACCENT`, iris9 — the same accent the DOM chrome uses) instead of the ad-hoc `#1a73e8`/`#2563eb` blues. Undeclared CSS variables and stale accent fallbacks in the stylesheet now resolve to the real theme tokens, so the affected popovers follow the active theme.

### Patch Changes

- Updated dependencies [ac128db]
  - @oh-just-another/tokens@0.58.0
  - @oh-just-another/state@0.62.0
  - @oh-just-another/renderer-core@0.60.1
  - @oh-just-another/templates@0.57.5
  - @oh-just-another/renderer-canvas@0.61.1
  - @oh-just-another/renderer-svg@0.57.5

## 0.60.0

### Minor Changes

- 0548ab3: Unify the active tool into a single `editor.activeTool` value object (breaking).
  - `state`: `editor.activeTool: ActiveTool` (`{ type, locked, lastActiveTool }`)
    replaces `editor.mode` and `editor.toolLocked`; `setActiveTool(type)` replaces
    `setMode`. `EditorOptions.initialMode` → `initialTool`. The typed `mode` event
    is now `tool` and fires with the `ActiveTool` object on a type switch or a
    lock flip. The action category `"mode"` is now `"tool"`. The vestigial
    `"eyedropper"` mode is removed from `Mode` — colour sampling is armed from
    the colour picker (`beginEyedropperPick`) and never was a toolbar tool.
  - `react-ui`: `useMode()` → `useActiveTool(): ActiveTool`;
    `DiagramRoot`/`DiagramCanvas` prop `initialMode` → `initialTool`.
  - `editor`: `EditorAPI.getMode/setMode` → `getActiveTool/setActiveTool`;
    `initialMode` prop → `initialTool`; re-exports `ActiveTool`.
  - `diagram` (+ vue/svelte/angular wrappers): element methods and controller
    `getMode/setMode` → `getActiveTool/setActiveTool`.

  Tool ids are unchanged (`"select"`, `"draw-rect"`, …). There are no visible
  behaviour changes — this is an API refactor establishing one source of truth
  for "which tool is active".

- 4722388: Editable width for committed brush strokes. `style.strokeWidth` never
  affected brushes (their widths are baked per point), so the property panel's
  Thin/Medium/Thick control silently did nothing for them. A brush-only
  selection now gets a popover range slider driving the new
  `Editor.setBrushWidth(ids, width)`, which scales every baked point width by
  `newWidth / baseWidth` — the stroke keeps its exact pressure profile at the
  new thickness — and records the new `baseWidth`. Legacy strokes without a
  recorded base fall back to their widest point. One undo step.
- 84450bc: Link captions: measured rounded pill, multiline, correct placement and hit-testing.
  - `scene`: new shared label geometry (`linkLabelAnchor`, `estimateLinkLabelBox`,
    `linkLabelBounds`, `pointAlongPath`) — one source of truth for the renderer,
    hit-testing and culling. `findLinkAt` now also hits inside the caption pill.
    Elbow links place an unpositioned label on the longest segment's midpoint;
    explicit `label.position` is clamped away from the arrowheads. Tunables in
    `constants.ts` (`LINK_LABEL_MAX_WIDTH`, paddings, clearance).
  - `renderer-core`: the caption is a rounded pill sized by real `measureText`
    word-wrap (multiline, `\n` breaks) instead of a square estimated box; it
    rides the drawn geometry (flattened curve for bezier, not the chord), and
    `computeLinkWorldBounds` unions the pill so dirty-rect / viewport culling
    never clip it. `LABEL_POSITION` / `LABEL_FONT_SIZE` constants moved to
    `scene` as `LINK_LABEL_DEFAULT_POSITION` / `LINK_LABEL_DEFAULT_FONT_SIZE`.
  - `state`: `linkLabelWorld` uses the shared anchor, so the inline editor opens
    exactly over the pill (including bezier and elbow links).
  - `react-ui`: the inline caption editor is a multiline textarea — Enter
    commits, Shift+Enter inserts a newline, Escape cancels.

### Patch Changes

- Updated dependencies [0548ab3]
- Updated dependencies [762dd8a]
- Updated dependencies [4722388]
- Updated dependencies [05707ed]
- Updated dependencies [50a2bd4]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
- Updated dependencies [acd01dc]
- Updated dependencies [da9d406]
- Updated dependencies [3c50ef1]
- Updated dependencies [f960332]
- Updated dependencies [99f9ab1]
- Updated dependencies [f9778a1]
- Updated dependencies [ea2f4e3]
  - @oh-just-another/state@0.61.0
  - @oh-just-another/scene@0.61.0
  - @oh-just-another/renderer-core@0.60.0
  - @oh-just-another/renderer-canvas@0.61.0
  - @oh-just-another/renderer-svg@0.57.4
  - @oh-just-another/templates@0.57.4
  - @oh-just-another/versioning@0.57.4

## 0.59.0

### Minor Changes

- 1c4941e: New `<DrawingPanel>` — a floating tool-options panel that appears while the brush or eraser is active. It edits `editor.brushSettings` (via the new `useBrushSettings` hook): line colour, enclosed-fill colour, opacity and width for the brush; only the width (which doubles as the eraser radius) for the eraser. `<Diagram>` mounts it automatically top-right, hidden in zen mode; opt out with the new `hideDrawingPanel` prop. This is a functional scaffold intended for restyling.
- ca48e8a: Add two interaction tools: an eraser (mode `erase`, hotkey `E`) and a laser pointer (mode `laser`, hotkey `K`).
  - Eraser: press-and-drag sweeps shapes under the cursor into a pending set (previewed dimmed) and deletes them all in one undo step on release. Attached links are removed with their shapes, like a Delete-key delete.
  - Laser pointer: press-and-drag paints an ephemeral red trail that fades over a couple of seconds. Nothing is written to the scene or history — it lives purely on the overlay. Available in read-only mode. Collab replication of trails is a follow-up.

  Both tools appear in the default toolbar (`DEFAULT_TOOLBAR` / `DEFAULT_VERTICAL_TOOLBAR`) and are registered as `mode-erase` / `mode-laser` actions. TTL, colour and width of the laser trail are tunable via `state/constants.ts`.

- bdc847e: Add four editor tools:
  - **Eyedropper** — new `eyedropper` mode (toolbar button, `Alt+I`). Click a
    shape to sample its fill/stroke and apply it to the selection.
    `Editor.pickColorAt` / `applyEyedropperAt` + pure `pickColorAt`.
  - **Convert element type** — `Editor.convertSelection(target)` and pure
    `computeConvertType` switch rectangle ↔ ellipse ↔ diamond (polygon) in place,
    preserving position/size/style. New "Shape type" property-panel control.
  - **Image crop** — optional normalised `crop` rect on `ImageElement` (additive,
    serialised). New `crop` mode entered by double-clicking an image or the
    property-panel Crop button: drag a frame, `Enter` to apply, `Esc` to cancel.
    Canvas2D renders the cropped source region (`RenderTarget.drawImage` gains an
    optional `crop` arg). `Editor.beginImageCrop` / `commitImageCrop` /
    `cancelImageCrop` + pure `computeSetImageCrop` / `cropRectFromWorldDrag`.
  - **Flowchart auto-generate** — `Cmd/Ctrl+Alt+Arrow` spawns a connected node
    from the selected node in that direction. `Editor.spawnConnectedNode` + pure
    `computeSpawnConnectedNode`.

  Also exposes `worldToLocal` from `@oh-just-another/scene`.

- 511a22a: The eyedropper is no longer a standalone toolbar tool (its palette button and the `Alt+I` hotkey / `mode-eyedropper` action are removed). Instead, every colour picker (`ColorSwatchPicker`) gains an optional pipette button via a new `onEyedrop` prop: clicking it arms `Editor.beginEyedropperPick(onPick)` and the next canvas click samples the colour of the shape under the cursor straight into that swatch — without changing the current tool mode. New editor API: `beginEyedropperPick` and the `isEyedropperArmed` flag; the cursor shows a crosshair while armed.
- dda2e56: Add a `<Minimap>` component (react-ui) — a small overview canvas that renders the whole scene with a frame for the current viewport; click / drag to pan the main view. Add `exportMermaid(scene)` (importers) — writes a `flowchart TD` string (inverse of `importMermaid`), round-tripping node + edge structure and emitting `%% skipped: <type>` comments for non-graph elements.
- 70a08d8: Read-only chrome. `<DiagramRoot>` / `<DiagramCanvas>` accept a `readOnly` prop (applied on mount and synced on change), a new `useReadOnly()` hook exposes the flag reactively, and the `<Toolbar>` disables creation / mutation tools (draw modes, insert-image, tool-lock, undo/redo) in read-only while keeping select / hand live.
- 7f69f29: Add scene text search, a stats/dimensions overlay, and zen mode.
  - `state`: `searchScene(scene, query)` / `elementSearchText(element)` — a pure, case-insensitive substring index over text shapes, frame names, and edge labels; plus `Editor.selectLink(id)` to programmatically select a single connector.
  - `react-ui`: `<SearchOverlay>` (⌘F) finds and frames matching text with next/prev navigation; `<StatsPanel>` (⌥/) shows the selection's x/y/w/h/angle and scene totals; `<ZenModeProvider>` / `useZenMode` (⌥Z, Esc to exit) hides chrome for focused work. All three are wired into `<Editor>` from `@oh-just-another/editor`.

- cf8b735: Add styled text runs (rich text, phase 1): a `TextElement` can now carry an optional `runs` overlay — contiguous substrings each with a partial `TextStyle` (bold / italic / colour / decoration) over the element's base style. The flat `text` stays the source of truth (`runs.map(r => r.text).join("") === text`), so plain-text scenes render, serialise and round-trip byte-for-byte unchanged.
  - `scene`: `TextRun` type + `TextElement.runs?`; pure helpers `runsToText`, `normalizeRuns`, `sliceRuns`, and `applyStyleToRange(el, from, to, partial)` (splits/merges/coalesces runs, sheds the overlay when uniform).
  - `serialization`: additive optional `runs` in the text schema; legacy documents (no `runs`) round-trip unchanged.
  - `renderer-core`: the text renderer draws each visual line's style segments with per-run font + fill through the shared `RenderTarget`, so Canvas2D, WebGL2 and SVG all honour runs. Line breaking still uses the element's base metrics.
  - `state`: `Editor.applyTextStyleToRange(id, from, to, partial)` applies a style to a character range as one undo step.
  - `react-ui`: the text formatting controls (bold / italic / underline / strikethrough / colour) target the current inline-edit selection when one is active — styling just those characters — and fall back to whole-element styling otherwise.

  Full inline rich-text editing (per-run wrap metrics, caret-aware run editing) is a follow-up.

### Patch Changes

- a9558d9: Reworked flowchart keyboard model. Arrow-key bindings are reworked and disambiguated by modifier: `Arrow` nudges (unchanged); `Cmd/Ctrl+Arrow` grows a flowchart CREATE session (each press adds a pending connected sibling, previewed on the overlay, committed as one undo step when Cmd/Ctrl is released, cancelled on Escape); `Alt+Arrow` navigates to the adjacent node (graph neighbour, else spatially nearest); `Cmd/Ctrl+Shift+Arrow` aligns (moved off the old plain `Alt+Arrow`). The old `Cmd/Ctrl+Alt+Arrow` spawn binding is retired.

  New API: `editor.growFlowchart` / `commitFlowchart` / `cancelFlowchart` / `navigateFlowchart` / `flowchartPreview`, the pure `computeSpawnConnectedNodes`, and `endpointElementId` (scene). `<Diagram>` wires the keyup-commit / Escape-cancel lifecycle for you.

- 22b90f9: The keyboard-shortcuts help dialog now lists every real binding. The `arrange` category (align / flip / distribute) was missing from the dialog's category order and is now shown, and keyTest-driven bindings (nudge arrows, Enter edit/create, plus flowchart create/navigate) surface their chips via a new display-only `Action.displayHotkey` field instead of rendering as "—". `displayHotkey` is never dispatched (only `hotkey`/`keyTest`/`sequence` are), which also closes a latent hole where a display matcher could fire a Ctrl-modified combo the `keyTest` deliberately excluded.
- 34ddb22: The minimap now supports wheel zoom: scrolling over it zooms the main view into the world spot under the cursor (recentering there first, matching its click-to-pan), using the same delta→factor curve as the main canvas. The handler is a non-passive listener so it doesn't scroll the page, and doesn't interfere with click/drag panning. Tunable via `MINIMAP_WHEEL_ZOOM_SPEED` / `MINIMAP_WHEEL_ZOOM_MAX_STEP`.
- bd2e26c: Make read-only (view) mode a true guard. Every mutating `Editor` method reachable from the UI (`updateStyle`, `updateTextProps`, `deleteSelected`, `duplicateSelected`, group/ungroup, align/flip/distribute, z-order, `moveSelectionBy`, `setLink`, `convertSelection`, `clear`, etc.) is now a no-op while `readOnly` is set, backstopping direct panel/hotkey calls that previously bypassed the pointer-level gate. The overlay keeps the selection outline (halo) but no longer paints resize/rotate/group handles or link endpoint grips in read-only, and the property panel / selection floating panel / mutating context-menu entries are hidden. `copy` / `copy-style` are flagged view-safe so they stay live.
- 5d8a282: Fix the bold / italic / underline / strikethrough toggles in the text style popover never applying to an in-edit text selection. The toggle button was a component defined inside `TextDecorationControl`, so it got a fresh identity on every panel re-render; during inline text editing the panel re-renders continuously (caret blink), and a remount between `mousedown` and `mouseup` swallowed the synthesized `click`. Hoisted the toggle to a stable module-level component so the button persists across re-renders and the click fires. Colour was unaffected (it goes through a stable control).
- 71a6c8b: Fix the search bar (⌘F) jumping to a match the moment it opens, before the user types anything. The query was retained across close/open, so reopening re-ran the reveal effect against the stale query and framed the previous match. The query and active index are now reset on close, so the bar always opens empty and only navigates once the user types.
- 71a6c8b: Search navigation no longer blows a small match up to fill the whole canvas. Jumping to a match now centers it while preserving the current zoom, only zooming out when the match is too large to fit — a small element stays small and just lands in the center. Adds `Editor.revealSelection(padding)` and the pure `computeRevealBounds` helper (never zooms in, unlike `zoomToSelection`'s fit-to-fill).
- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [641842b]
- Updated dependencies [c189261]
- Updated dependencies [c58054b]
- Updated dependencies [b156869]
- Updated dependencies [0d3934e]
- Updated dependencies [0d3934e]
- Updated dependencies [b0a9f3b]
- Updated dependencies [571f13b]
- Updated dependencies [ca48e8a]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [bdc847e]
- Updated dependencies [511a22a]
- Updated dependencies [a9558d9]
- Updated dependencies [22b90f9]
- Updated dependencies [99b5bee]
- Updated dependencies [f381039]
- Updated dependencies [394d3ce]
- Updated dependencies [295f38b]
- Updated dependencies [bd2e26c]
- Updated dependencies [97de2fd]
- Updated dependencies [407f203]
- Updated dependencies [744f4b8]
- Updated dependencies [71a6c8b]
- Updated dependencies [7f69f29]
- Updated dependencies [dde8279]
- Updated dependencies [cec8f83]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [cf8b735]
- Updated dependencies [571f13b]
- Updated dependencies [f8302c3]
  - @oh-just-another/scene@0.60.0
  - @oh-just-another/state@0.60.0
  - @oh-just-another/renderer-core@0.59.0
  - @oh-just-another/renderer-canvas@0.60.0
  - @oh-just-another/renderer-svg@0.57.3
  - @oh-just-another/templates@0.57.3
  - @oh-just-another/versioning@0.57.3

## 0.58.0

### Minor Changes

- b4b252b: Arrange operations for the selection. **Flip** mirrors the selection about its bounding-box centre — horizontal (`Shift+H`) and vertical (`Shift+V`); a single shape flips about its own centre. **Align** flushes two or more shapes to the left / right / top / bottom edge or the horizontal / vertical centre of their bounding box (`Alt+←/→/↑/↓` for the four edges; centres via the panel / menu). **Distribute** evenly spaces three or more shapes so the gaps between them are equal, on the horizontal (`Alt+H`) or vertical (`Alt+V`) axis, keeping the outermost shapes fixed. All three are available from the selection property panel and the right-click menu. New engine API: `Editor.flipSelection(axis)`, `Editor.alignSelection(edge)`, and `Editor.distributeSelection(axis)`.
- 578e728: Clear the whole canvas with `Cmd/Ctrl+Delete` (or `Backspace`), from the command palette, or the right-click menu. Because it wipes every shape and isn't undoable, it always asks for confirmation first.
- d20d50a: Copy and paste a shape's visual style. `Cmd/Ctrl+Alt+C` captures the fill / stroke / dash / opacity of the selected shape into an in-editor buffer; `Cmd/Ctrl+Alt+V` applies it to the current selection (one undo step). Also available from the right-click menu. New engine API: `Editor.copySelectionStyle()` / `Editor.pasteSelectionStyle()` and the `hasStyleClipboard` flag.
- 09a096c: Add `PortalContainerProvider` / `usePortalContainer` — floating UI (tooltips, popovers, context menus, hover chips) now portals into a configurable container instead of always `document.body`. Defaults to `document.body`, so existing usage is unchanged; a host mounting the editor in a shadow root points it at a node inside the root so portaled content stays styled.

### Patch Changes

- 7217cac: The canvas surface no longer draws a focus ring on a mouse click. The surface
  takes focus on press (so keyboard shortcuts work right after clicking), which
  made it light up with an outline like a focused text input. The ring is now
  gated on `:focus-visible`, so it appears only for keyboard focus (Tab) and never
  for a pointer press.
- 60e315e: Fix the context menu (and any chrome reading the legacy `--menu-*` / `--panel` /
  `--text` aliases) ignoring an explicit app theme. The aliases forward to the
  `--du-*` theme variables via `var()`, but were declared only on `:root` — and a
  `var()` inside a custom property resolves on the element where it's declared. So
  under an OS dark preference the alias baked in `:root`'s dark value and inherited
  that frozen colour straight past a `[data-theme="light"]` override, leaving a
  dark menu on a light app. The aliases are now declared at every theme scope
  (`:root`, `[data-theme="light"]`, `[data-theme="dark"]`) so each re-resolves
  against the scoped `--du-*`.
- 60e315e: Fix floating chrome ignoring the app theme. The selection / property panel,
  popovers, tooltips and the right-click context menu portal out of the editor
  root, which also escaped the `data-theme` set there — so under an OS dark
  preference they showed a dark surface even when the app was set to light (and
  vice-versa). They now portal into a wrapper that mirrors the editor's theme, so
  they always match the app. The context menu additionally portals into that
  wrapper and its colours forward to the `--du-*` theme variables (no more
  hard-coded dark fallbacks / hover).
- Updated dependencies [b4b252b]
- Updated dependencies [1c7cc6c]
- Updated dependencies [d20d50a]
- Updated dependencies [0152ed6]
- Updated dependencies [938e7c8]
- Updated dependencies [9673846]
- Updated dependencies [f370dba]
- Updated dependencies [1c7cc6c]
- Updated dependencies [e1fd495]
- Updated dependencies [8f00738]
- Updated dependencies [1c7cc6c]
- Updated dependencies [ff90a95]
- Updated dependencies [da91d59]
- Updated dependencies [3152317]
- Updated dependencies [fc47ecc]
- Updated dependencies [8fc6b69]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
- Updated dependencies [edde5d0]
- Updated dependencies [1c7cc6c]
- Updated dependencies [c5be6e5]
  - @oh-just-another/state@0.59.0
  - @oh-just-another/renderer-canvas@0.59.0
  - @oh-just-another/scene@0.59.0
  - @oh-just-another/renderer-core@0.58.0
  - @oh-just-another/math@0.58.0
  - @oh-just-another/renderer-svg@0.57.2
  - @oh-just-another/templates@0.57.2
  - @oh-just-another/versioning@0.57.2

## 0.57.3

### Patch Changes

- d1b96d9: Open the context menu solely from the editor's gesture channel
  (`editor.onLongPress`, fired by a clean right-click or touch long-press and
  scoped to the editor host) instead of a separate `contextmenu` DOM listener.
  The old listener defaulted to `window`, so a right-click anywhere on the page
  opened the diagram menu (and suppressed the native one) when the editor was
  embedded in a larger document. The redundant `<ContextMenu target>` prop is
  removed.
- Updated dependencies [d1b96d9]
  - @oh-just-another/scene@0.58.0
  - @oh-just-another/state@0.58.0
  - @oh-just-another/history@0.57.1
  - @oh-just-another/renderer-canvas@0.58.1
  - @oh-just-another/renderer-core@0.57.1
  - @oh-just-another/renderer-svg@0.57.1
  - @oh-just-another/templates@0.57.1
  - @oh-just-another/versioning@0.57.1

## 0.57.2

### Patch Changes

- ac94614: Fix canvas flicker on container / window resize. The `ResizeObserver` callback
  now repaints synchronously (`editor.forceRender()`) instead of deferring to the
  next animation frame — `surface.resize()` clears the canvas immediately, so a
  deferred render let the cleared frame paint first, producing one blank frame per
  resize event.

## 0.57.1

### Patch Changes

- Updated dependencies [8515093]
  - @oh-just-another/renderer-canvas@0.58.0

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/history@0.57.0
  - @oh-just-another/math@0.57.0
  - @oh-just-another/renderer-canvas@0.57.0
  - @oh-just-another/renderer-core@0.57.0
  - @oh-just-another/renderer-svg@0.57.0
  - @oh-just-another/scene@0.57.0
  - @oh-just-another/state@0.57.0
  - @oh-just-another/templates@0.57.0
  - @oh-just-another/tokens@0.57.0
  - @oh-just-another/types@0.57.0
  - @oh-just-another/versioning@0.57.0
