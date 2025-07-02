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
