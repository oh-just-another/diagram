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
