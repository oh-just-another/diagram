# Changelog

## 0.1.1
- init

## 0.2.0
- chore: initial setup and changesets config

## 0.3.0
- feat: types math

## 0.4.0
- feat: scene

## 0.5.0
- feat: renderer canvas

## 0.6.0
- feat: state

## 0.7.0
- feat: history

## 0.8.0
- feat: serialization templates

## 0.9.0
- feat: b.

## 0.10.0
- feat: headless

## 0.11.0
- feat: misc

## 0.12.0
- feat: react ui

## 0.13.0
- feat: react-ui split (DiagramRoot + DiagramSurface), playground ghost shapes

## 0.14.0
- feat: react demo

## 0.14.1
- feat: register rich template renderer + hit-tester in demo

## 0.15.0
- feat: importers

## 0.16.0
- feat: collab

## 0.16.1
- feat: collab sync handshake + skip localStorage in room

## 0.16.2
- feat: cross-realm typed-array detect in BroadcastChannelTransport

## 0.16.3
- feat: release prep

## 0.16.4
- feat: anchors

## 0.17.0
- feat: (MVP)

## 0.17.1
- feat: follow-up: port overlay, snap, edge selection + endpoint editing

## 0.18.0
- feat: snap outline

## 0.18.1
- feat: grid context menu

## 0.18.2
- feat: template spot ports

## 0.18.3
- feat: multi select lasso

## 0.19.0
- feat: layers group resize

## 0.20.0
- feat: perf scale up

## 0.21.0
- feat: collab follow ups

## 0.21.1
- feat: mobile touch

## 0.21.2
- feat: a11y

## 0.22.0
- feat: comments

## 0.23.0
- feat: versioning

## 0.23.1
- Fix viewport culling: sync size from DiagramRoot ResizeObserver

## 0.23.2
- feat: viewport controls + horizontal scroll fix + zoom hotkeys/toolbar/menu

## 0.23.3
- feat: moveSelectionToLayer menu + removeComment UI + Save/Load/Export hotkeys

## 0.23.4
- feat: layer.locked enforcement (hit-test/lasso/focus/nudge skip locked)

## 0.23.5
- feat: inline text edit (Editor.beginTextEdit + TextEditorOverlay)

## 0.23.6
- feat: annotation drag (press pin Right move Right release commits)

## 0.23.7
- feat: HistoryProvider interface + @mentions helpers + persistence demo SnapshotStore

## 0.23.8
- feat: layout helpers + grouping/perf design specs + diff stats UI

## 0.23.9
- feat: design specs (CRDT merge, OffscreenCanvas, mobile, a11y CI, e2e)

## 0.23.10
- feat: hit-test SpatialGrid, edge AABB cache, constants audit

## 0.23.11
- feat: parent-child grouping

## 0.23.12
- feat: branch merge (three-way diff + MergeDialog)

## 0.23.13
- feat: OffscreenCanvas + WorkerPool primitives

## 0.23.14
- feat: brush strokes (Apple Pencil pressure) + bottom-sheet

## 0.23.15
- feat: accessibility audit + keyboard-only creation

## 0.23.16
- feat: Playwright E2E suite

## 0.23.17
- e2e: rename `test` Right `e2e` so workspace-wide pnpm -r test skips it

## 0.23.18
- state: paste lands at cursor instead of original-position+10

## 0.23.19
- react-ui: standalone zoom components + toolbar item kinds

## 0.23.20
- state: live selection preview during lasso drag

## 0.23.21
- state: grid layout — arrangeAsGrid / arrangeAsStack commands

## 0.23.22
- state: coverage-based lasso + auto-select on press

## 0.23.23
- state: hide per-shape resize handles when multi-selected

## 0.23.24
- state: bigger, rounded, easier-to-grab resize handles

## 0.23.25
- state: group resize writes width/height, not scale (fix border + jump)

## 0.23.26
- state: container / drop-zone protocol — swim-lane as parent

## 0.23.27
- state: live drop-zone resolver + z-order fix + grid seed scene

## 0.23.28
- templates: drop-zone resolver injects shape size into root layout

## 0.23.29
- state: auto-grow container when child moves past its drop-zone edge

## 0.23.30
- demo: wire Task-card button Right toast so taps are visible

## 0.23.31
- react-ui: stacked palette sections, no tab switching

## 0.23.32
- state: container resize floors at children's union AABB

## 0.23.33
- state+react-ui: drag-from-palette spawns live preview centred at cursor

## 0.23.34
- react-ui: hide HTML5 drag ghost during palette drag

## 0.23.35
- react-ui: 1×1 canvas as drag-image ghost (was broken-img globe)

## 0.23.36
- react-ui: drag ghost = transparent div in DOM (was detached canvas)

## 0.23.37
- react-ui: drag ghost must have non-zero area + visible bg

## 0.23.38
- state: compactLayerZOrder — rebalance fractional indices on demand

## 0.23.39
- state: wire brush mode into pointer flow + live preview overlay

## 0.23.40
- react-ui: wire MergeDialog into VersionPanel

## 0.23.41
- state+renderer-core: dirty-rect rendering for main canvas

## 0.23.42
- state: force full clear until viewport has real size

## 0.23.43
- state: auto-compact fractional indices (x5/graph-style)

## 0.23.44
- state+react-ui: tests pinning the first-render path

## 0.23.45
- state: temporarily disable dirty-rect rendering (regression repro pending)

## 0.23.46
- state: re-enable dirty-rect + debug logging; .md no-revert rule

## 0.23.47
- state: render trace logs unconditionally (debug)

## 0.23.48
- renderer-canvas: setupHiDpi + LayeredCanvas.resize are idempotent

## 0.23.49
- state: pan canvas with right-click drag or held Space + drag

## 0.23.50
- state: fix pan direction + right-click vs context-menu disambiguation

## 0.23.51
- state: mouse wheel zooms by default (modern-style); trackpad still pans

## 0.23.52
- state: wheel always zooms — drop mouse-vs-trackpad heuristic

## 0.23.53
- state: wheel = pan, Cmd/Ctrl + wheel = zoom (x5/graph )

## 0.23.54
- state: restore wheel-pan negation (trackpad direction fix)

## 0.23.55
- state: scale wheel zoom factor with |deltaY| (trackpad pinch fix)

## 0.23.56
- state: bump trackpad pinch zoom speed (~1.67×)

## 0.23.57
- state: tune WHEEL_ZOOM_SENSITIVITY to ln(STEP)/20

## 0.23.58
- state: stream-locked wheel routing — mouse=zoom, trackpad=pan

## 0.23.59
- state: modern-style wheel routing — mouse=zoom, trackpad=pan (sticky)

## 0.23.60
- .md: rule 8 — UI/UX changes need approval before edit

## 0.23.61
- state/tests: pin nested-group behaviour ((A+B)+C) Right ungroup

## 0.23.62
- state: drill-down into groups via double-click + Esc/click-outside exit

## 0.23.63
- renderer-core+state: dim non-isolation shapes (modern-style)

## 0.23.64
- state: corner-only handles + aspect-locked resize for groups

## 0.23.65
- state: fix group resize + dim invalidation regressions

## 0.23.66
- state: drag on group always carries descendants, even when unselected

## 0.23.67
- state: never dim the selected shape (isolation guard)

## 0.23.68
- state: applyContainerDrop must not strip parentId for group children

## 0.23.69
- scene+state: containers omit center from snap anchors

## 0.23.70
- state: dirty-rect must invalidate edges attached to moved shapes

## 0.23.71
- scene+state: auto-layout containers

## 0.23.72
- react-ui: context-menu "Auto-arrange children" for layout containers

## 0.23.73
- scene: treeLayout (Reingold-Tilford-style, no dagre dep)

## 0.23.74
- state+scene+renderer-core: per-shape lock/hide with group propagation

## 0.23.75
- demo: auto-layout palette entries

## 0.23.76
- renderer: add markDirty(bounds) + Canvas2DTarget accumulator

## 0.23.77
- demo: Clear button also wipes the localStorage autosave

## 0.23.78
- demo: Clear restores the default seed scene (not empty)

## 0.23.79
- state+react-ui+demo: hand mode + tool lock (standard )

## 0.24.0
- state+demo: modern-style Action registry

## 0.24.1
- demo: add 🔒 tool-lock to the toolbar items list

## 0.24.2
- scene+state: auto-layout anchors at drop-zone + grows container

## 0.24.3
- react-ui: toolbar + palette react to host CSS theme tokens

## 0.25.0
- state: split actions into per-category files + add platform helpers

## 0.25.1
- state: palette-drop reparents into auto-layout containers

## 0.25.2
- react-ui+demo: HelpDialog with platform-aware shortcut list ("?")

## 0.25.4
- state: FileDropRegistry — extensible canvas-drop dispatch

## 0.25.5
- state+react-ui+demo: image insertion via toolbar + drag-to-canvas

## 0.25.6
- state+react-ui+demo: EdgeStylePanel — arrowheads / dash / color / label

## 0.25.7
- scene+renderer-core+state+demo: Frame element

## 0.26.0
- react-ui+demo: MainMenu, ToastHost, WelcomeScreen

## 0.26.1
- state: animated image support (GIF) + decoded <img> for any image type

## 0.26.2
- state+scene: GIF actually animates + side-aware elbow routing

## 0.26.3
- scene+react-ui: side-by-side DiffPanel

## 0.26.4
- renderer-core: per-shape bitmap cache infrastructure

## 0.26.5
- renderer-core+collab: heavy scaffolding

## 0.26.6
- constants: 3 inline magic numbers Right per-package constants.ts

## 0.26.7
- audit: drop 3 unused exports flagged by knip

## 0.26.8
- state: extract AnimationTick from editor.ts

## 0.26.9
- state: extract AutoCompactScheduler from editor.ts (chunk 2)

## 0.26.10
- state: extract AutoLayoutScheduler from editor.ts (chunk 3)

## 0.26.11
- scene+renderer-core+demo: BlockArrowShape

## 0.26.12
- react-ui: Modal + Sidebar primitives

## 0.26.13
- edges: block-arrow as connector kind

## 0.26.14
- react-ui+demo: FloatingZoomControls

## 0.26.15
- demo: paste image from clipboard

## 0.26.16
- state+demo: video file drop + playback

## 0.26.17
- only target changed Right keep target's version same change in both branches Right accept either both removed Right delete added in source only Right take source's added in target only Right keep target's Anything else surfaces as a ThreeWayMergeConflict; the auto- merged scene defaults to target's version for those shapes so hosts can render-while-resolving. - `applyConflictResolutions(report, [{shapeId, choice}])` — choice is `"ours" | "theirs" | "both"`. `"both"` keeps target + clones source with a suffix id (default `"{id}-copy"`, overridable via `cloneWithNewId`).

## 0.26.18
- renderer-core: InMemoryTileCache

## 0.26.19
- renderer-core+renderer-canvas: JS TextShaper + Rasterizer defaults

## 0.26.20
- renderer-canvas+demo: WebGL2Target MVP + renderer-mode scripts

## 0.26.21
- state: drop sticky trackpad lock — mouse wheel always zooms again

## 0.26.22
- demo: `dev:fresh` + `clean:cache` scripts — no more rm -rf instructions

## 0.26.23
- react-ui: HelpDialog + MergeDialog migrate to Modal

## 0.26.24
- renderer-canvas: tile compositor for very-large scenes

## 0.26.25
- renderer-canvas: WebGL2Target — stroke + polyline pipeline

## 0.26.26
- state: EditorOptions.useTileCache + tileCompose hook

## 0.26.27
- renderer-canvas: WebGL2 ellipse + image + bezier curves

## 0.26.28
- state: extract group/isolation helpers

## 0.26.29
- state: extract frame + clipboard helpers

## 0.26.30
- renderer-canvas: ship worker script + LayerWorkerPool

## 0.26.31
- collab: BranchDoc (Yjs subdoc branches + three-way merge)

## 0.27.0
- text-wasm + raster-wasm: new L5 WASM-backend packages

## 0.28.0
- demo: dropdown + URL/localStorage for on-the-fly switch renderer
## 0.28.1
- state + react-ui: double-click text Right inline edit + auto-resize

## 0.28.2
- state + collab: pluggable HistoryProvider + YjsHistory

## 0.28.3
- scene: pluggable layout kind registry

## 0.28.4
- state: share SpatialGrid between hit-test and renderScene

## 0.28.5
- fix: graceful renderer-backend fallback + WebGL2 context cleanup

## 0.28.6
- react-ui: axe-core a11y sweep + WCAG AA contrast tests

## 0.28.7
- e2e: persistence + collab smoke specs

## 0.28.8
- exporter + react-ui: frame export crop + <FramePanel>

## 0.28.9
- scene: A*-based elbow router

## 0.28.10
- renderer-core: per-edge ImageBitmap cache

## 0.28.11
- renderer-core: TileCache.invalidateRect + invalidateForPatch

## 0.28.12
- scene + renderer-core: animation adapter scaffold

## 0.28.13
- fix: paste mid-gesture no longer throws "transaction already open"

## 0.28.14
- state: added test "paste = one undo step" (regression guard)

## 0.28.15
- state + renderer-canvas: Editor wires invalidateForPatch + 1M bench

## 0.28.16
- renderer-core: edge bitmap + layer composite cache wired

## 0.28.17
- renderer-canvas: WebGL2 fillText + WebGPU feature-detect

## 0.28.18
- scene + serialization: Scene.files binary registry

## 0.28.19
- state + react-ui: folder-drop via webkitGetAsEntry

## 0.28.20
- state: Annotation drag

## 0.28.21
- react-ui: annotation pin right-click context menu

## 0.28.22
- react-ui: lightweight markdown in CommentsPopover

## 0.28.23
- new package: @renderer-workers

## 0.28.24
- e2e: mobile UI screenshot baseline

## 0.28.25
- e2e: removed test-results from repo + added .gitignore

## 0.28.26
- state: wire Scene.files in imageFileDropHandler

## 0.29.0
- WASM text shaping + raster — full implementation

## 0.29.1
- demo: WASM text shaping toggle in header

## 0.30.0
- apps/demo Right apps/diagram: library <Diagram> component

## 0.30.1
- WASM raster: end-to-end wire-up

## 0.30.2
- fix: WebGL2 unavailable false-positive in StrictMode

## 0.30.3
- fix: hybrid WebGL2 surface — main only, overlay/background on Canvas2D

## 0.30.4
- fix: regression on palette drop + shape render — roll back webgl2 to auto

## 0.30.5
- WebGL2: shapes visible — fix parseColor / preserveDrawingBuffer / scissor clear

## 0.30.6
- text-wasm: add MSDF glyph rasterisation + per-glyph metrics

## 0.31.0
- glyph-atlas + curve-mesh: GPU-side primitives for sharp text & curves

## 0.32.0
- WebGL2: MSDF text + zoom-aware curve tolerance

## 0.32.1
- WebGL2: polygon fill + zoom-aware ellipse + miter stroke joins

## 0.32.2
- diagram: register WASM shaper / rasterizer with the active registry

## 0.32.3
- WebGL2 MSDF text: fix dimension mismatch in glyph quad margin

## 0.32.4
- WebGL2 MSDF text: y-flip the glyph + crop UVs to the used tile region

## 0.32.5
- diagram: wire usePalettePlacement onto the canvas wrapper

## 0.32.6
- react-ui: remove WelcomeScreen component

## 0.32.7
- diagram: move usePalettePlacement into a child of DiagramRoot

## 0.32.8
- text-wasm MSDF: add correct_error_msdf pass to kill pin-hole artefacts

## 0.32.9
- WebGL2 polygon fill: earcut triangulation for concave shapes

## 0.32.10
- WebGL2 MSDF: pin glyph-quad geometry behaviour with unit tests

## 0.32.11
- WebGL2 MSDF: fix corner rounding + inter-letter bleeding stripes

## 0.32.12
- WebGL2 stroke: seamless miter join on closed polylines (rect / ellipse)

## 0.33.0
- shapes: adaptive corner radius + lineJoin/lineCap (modern-style)

## 0.33.1
- PropertyPanel: Join / Cap / Corners controls + Editor.updateStyle

## 0.33.2
- strokeAlign: honour inside / outside (rectangle + UI)

## 0.33.3
- PropertyPanel: editable Fill / Stroke colour pickers

## 0.33.4
- strokeAlign: honour inside / outside for ellipse / polygon / arrows

## 0.33.5
- WebGL2 curves: Loop-Blinn fill overlay on top of polygon hull

## 0.33.6
- docs: bug tracker viafolder

## 0.34.0
- apps/diagram: modern-style layout + CSS-system

## 0.34.1
- apps/diagram vite: alias for react-ui/styles.css sub-path

## 0.34.2
- vite alias: generic regex for workspace sub-paths

## 0.34.3
- apps/diagram: match standard zone placement

## 0.34.4
- apps/diagram MainMenu: full action set (File / Edit / View / Help)

## 0.34.5
- Theme switcher + MainMenu close-on-canvas fix

## 0.34.6
- react-ui: ColorSwatchPicker + theme-aware palette constants

## 0.34.7
- fix: Reset canvas keeps the grid + light theme for legacy menus

## 0.34.8
- MainMenu: horizontal Toggle (segmented control) for theme picker

## 0.34.9
- fix: restored scenes get the grid back

## 0.34.10
- Grid: dots style + MainMenu toggle (Lines / Dots / Off)

## 0.34.11
- Grid dots: uniform modern-style lattice

## 0.34.12
- Grid: modern-style multi-level rendering with opacity modulation

## 0.34.13
- wheel zoom: modern-style normalisation (clamp 10, speed 1)

## 0.34.14
- TopBar: unify all 3 zones as pill button-groups

## 0.34.15
- top bar: fix MainMenu popup + modern-style pill polish

## 0.34.16
- MainMenu trigger: flat styling to match toolbar buttons

## 0.35.0
- feat: modern-style collab sessions

## 0.35.1
- remove apps/relay — collab server lives in diagram-collab now

## 0.36.0
- UI polish: Lucide icons, tonal active state, singleton tooltip

## 0.36.1
- feat(events): new L0 typed event-emitter package

## 0.37.0
- feat: typed Editor emitter + commitGesture notify fix + carve start

## 0.38.0
- feat: carve editor.ts Right applies/{create,edge,move} + long-press

## 0.39.0
- feat: carve hit-test, pinch, container-ops, resize, traits

## 0.40.0
- feat: carve pointer-binding (last step, editor.ts 4439 Right 3789)

## 0.41.0
- feat: carve public API — brush, clipboard, layers, zoom-pan, annotations

## 0.42.0
- feat: carve text-edit, z-order, arrange-group, image-insert, selection-ops

## 0.42.1
- feat: carve placement + render-orchestrator (editor.ts 3246 Right 3083)

## 0.42.2
- HelpDialog: modern-style key chips + platform-aware layout

## 0.42.3
- Library panel: search, tags, pin (no-auto-close), dock (canvas split)

## 0.42.4
- Library panel: drop visual artefacts + Lucide everywhere

## 0.43.0
- PropertyPanel: modern-style sectioned inspector

## 0.43.1
- PropertyPanel: stroke-style fix, drop join/cap/align, flat groups, auto radius

## 0.43.2
- ColorSwatchPicker: 26-px cells, selected ring, hover-grow fill

## 0.43.3
- Editor: bringForward / sendBackward — one-step z-order ops

## 0.43.4
- fix: hotkeys now work on non-Latin keyboard layouts

## 0.43.5
- hotkeys: guard layout-fallback so swapped-Latin layouts aren't hijacked

## 0.43.6
- Side panels: drop titles; Properties hugs its content height

## 0.43.7
- fix: dirty-rect skipped overlapping siblings on shape drag

## 0.43.8
- fix: disable dirty-rect during active gesture (z-order jitter)

## 0.43.9
- feat(tokens): add @oh-just-another/tokens L0 package and wire across project

## 0.43.10
- fix: WebGL2 bright halo around semi-transparent shapes

## 0.44.0
- feat: floating selection panel + DebugPanel + auto-grid drop-zone fix

## 0.44.1
- docs: rule 10 — commit after each meaningful unit of work

## 0.44.2
- fix: WebGL2 GL state hot-path cleanup (B1 + B2)

## 0.44.3
- fix: rAF-coalesce Editor.notify Right render (B8)

## 0.44.4
- fix: PNG export captures full scene + MainMenu.Submenu

## 0.44.5
- refactor(react-ui): drop "Clear scene" from DEFAULT_CONTEXT_MENU

## 0.44.6
- fix: LRU cap on WebGL2Target.textBitmaps (B5)

## 0.44.7
- fix: adaptive MAX_TILE_CACHE_BYTES per device memory (B10)

## 0.44.8
- fix: scratch buffer pool in webgl2-stroke — zero alloc hot path (B13)

## 0.44.9
- fix: earcut + triangle-fan scratch buffer pool (B16)

## 0.44.10
- fix: fragment-SDF ellipse pipeline (skip polygon tesselation)

## 0.44.11
- fix: auto-open library panel on mount when pinned or docked

## 0.44.12
- fix: MSDF text scratch buffer pool — zero alloc hot path (B15)

## 0.44.13
- fix: LRU cap on WebGL2Target.textures with deterministic gl.deleteTexture (B6)

## 0.44.14
- refactor(templates): drop duplicated basic.arrow polygon template

## 0.44.15
- fix: accept OS file drops on canvas (preventDefault for Files)

## 0.44.16
- feat: Frame + Insert image toolbar buttons (hotkeys F / I)

## 0.44.17
- fix: honor ?renderer= URL override in apps/diagram

## 0.44.18
- fix: serialize image fileId + animation fields (data-loss blocker)

## 0.44.19
- fix: image rendering hardening — crash guards, dynamic re-upload, serialize strip

## 0.44.20
- feat: GIF animation via frame decoder (Canvas2D + WebGL2, reload-safe)

## 0.44.21
- perf: animation-tick viewport-cull + pause-on-hidden + adaptive fps (G1-G3)

## 0.44.22
- feat(debug): fractal generator — tree / Mandelbrot / Julia / attractors

## 0.44.23
- feat: per-shape GIF playback — heavy auto-stop, reduced-motion, hover (G4+G5)

## 0.45.0
- feat: text tool + in-canvas editing + typography panel

## 0.45.1
- fix: pan FPS drop from per-frame file base64 re-encode

## 0.45.2
- feat: multi-font WebGL2 text (sans/serif/mono) + fonts dev doc

## 0.45.3
- fix: text "jump" on page load — hold first paint until MSDF shaper settles

## 0.45.4
- fix: copy/paste of image & GIF shapes

## 0.45.5
- fix: shift-click multi-select extends selection

## 0.45.6
- fix: hide Fill/Stroke controls for image shapes in property panel

## 0.45.7
- fix: image/GIF resize is aspect-locked, not free-distort

## 0.45.8
- fix: mixed group resize keeps images proportional

## 0.45.9
- fix: GIFs sometimes blank after reload — re-render on async decode

## 0.45.10
- feat: text panel combined color & opacity control (T4)

## 0.45.11
- feat: text decorations bold/italic/underline/strikethrough (T3 pt1)

## 0.45.12
- feat: WebGL2 real bold/italic via 12-face WASM font matrix (T3 pt2)

## 0.45.13
- fix: text style toggles (B/I/U/S) now show active state

## 0.45.14
- feat: element hyperlinks (T6 pt1) — href on any shape + Cmd-click open

## 0.45.15
- feat: hover link popup (T6 pt2)

## 0.45.16
- fix: text bounds account for bold/italic — no overflow

## 0.46.0
- refactor: migrate npm scope @oh-just-another Right @oh-just-another (org move)

## 0.46.1
- refactor: rebrand bare token oh-just-another Right oh-just-another (BREAKING format)

## 0.46.2
- fix: reset zoom keeps camera focal point, not jump to origin

## 0.46.3
- feat: platform-correct hotkeys in zoom-toolbar tooltips

## 0.46.4
- refactor: move auto-grid/auto-stack to a "layout" palette category

## 0.46.5
- feat: larger decoupled mouse hit-zones for handles/edges

## 0.46.6
- feat: debug-panel Display tab — render switch + hit-zone overlay; "g d" toggle

## 0.47.0
- refactor(rename 1/N): ShapeIdRightElementId, EdgeIdRightLinkId brands

## 0.48.0
- refactor(rename 2/N): element entity type-layer ShapeRightElement

## 0.49.0
- refactor(rename 3/N): EdgeRightLink types, functions, constants

## 0.50.0
- refactor(rename 4/N): element entity functions/vars ShapeRightElement

## 0.50.1
- refactor(rename 5a/N): Patch + PressTarget kind literals shapeRightelement, edgeRightlink

## 0.50.2
- fix(rename 5a): convert Patch-kind literals in test files (missed in 9d1cbe3)

## 0.50.3
- fix(rename 5a): apply Patch/PressTarget kind rename to SOURCE (was only in tests)

## 0.51.0
- refactor(RN 5b): rename Scene.shapes/edges Right elements/links + serialization format (BREAKING)

## 0.51.1
- refactor(RN batch 6a): rename renderer-core Shape* machinery Right Element* (BREAKING)

## 0.51.2
- refactor(RN batch 6b): rename editor.shapeLink Right elementLink (BREAKING)

## 0.51.3
- refactor(RN batch 6c): rename element-type vocabulary BuiltinShape/CustomShapeZ/DefaultShapeStyle Right Element* (BREAKING)

## 0.51.4
- refactor(RN batch 6a follow-up): rename getShapeRenderer/hasShapeRenderer Right Element (BREAKING)

## 0.51.5
- refactor(RN batch 6d): rename private shapeUnder/shapesIntersectingTile Right element*

## 0.51.6
- docs(RN batch 6e): sync all READMEs to element/link vocabulary; add naming rule

## 0.51.7
- chore(RN batch 6f): add cumulative breaking changeset for shapeRightelement / edgeRightlink rename

## 0.51.8
- feat(scene): geometry-aware default anchors (A1 — pure , additive)

## 0.51.9
- feat(scene): add `edge` AnchorRef kind for on-edge polygon anchors (A2a — additive)

## 0.51.10
- feat(scene): snap to geometry-default anchors w/ edge refs (A2b — snap cut-over)

## 0.51.11
- feat(state): anchor visual constants for the two link-roles (geometry-aware-anchors B)

## 0.51.12
- feat(state): two-role connection anchors overlay (geometry-aware-anchors C)

## 0.51.13
- feat(scene): getAnchorOutwardNormal for off-edge anchor outset (geometry-aware-anchors C2a)

## 0.51.14
- feat(state): off-edge anchor outset, separate per role (geometry-aware-anchors C2b)

## 0.51.15
- feat(templates): port coordinate systems via PortNode.system (geometry-aware-anchors E)

## 0.51.16
- fix: don't show link-attach anchors on idle hover in select mode

## 0.51.17
- feat(state): draw a link from a start-anchor without the draw-edge tool

## 0.51.18
- fix: show link-start anchors immediately on select

## 0.51.19
- fix(test): make start-anchor regression robust + correct fix-commit hash

## 0.51.20
- fix: deselect on first click near a selected element

## 0.51.21
- fix: Escape clears selection even when the library search box has focus

## 0.51.22
- fix(test): correct deselect-near-anchor coordinates (was red in ae9bc29)

## 0.51.23
- fix: apply the actual Escape-passthrough in hotkeys.ts (was missing from cff0a89)

## 0.51.24
- fix(test): use the real grab+empty halo coordinate (55,20); green now

## 0.51.25
- feat(state): constants for click-anchor-creates-element (step 1/3)

## 0.51.26
- feat(state): click a link-start dot to create a linked element (standard)

## 0.51.27
- fix(test): move deselect halo point 55Right58 (was committed red in 2700531)

## 0.51.28
- feat(state): floating (whole-shape) link endpoints (standard)

## 0.51.29
- feat(state): hover-to-connect link dots (standard)

## 0.51.30
- feat(state,react-ui): link drop-on-empty Right shape picker (standard)
