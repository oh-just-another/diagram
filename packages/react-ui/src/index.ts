export {
  DiagramProvider,
  useDiagramContext,
  useDiagramContextOptional,
  useEditorSelector,
} from "./core/context.js";
export { IconButton, type IconButtonProps } from "./primitives/icon-button.js";
export { ButtonGroup, type ButtonGroupProps } from "./primitives/button-group.js";
export {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlProps,
} from "./primitives/segmented-control.js";
export { Slider, type SliderProps } from "./primitives/slider.js";
export { Switch, type SwitchProps } from "./primitives/switch.js";
export { useFullscreen } from "./core/use-fullscreen.js";
export { UILayer, type UILayerProps } from "./layout/ui-layer.js";
export { TopBar, BottomBar, type DiagramBarProps } from "./layout/diagram-bars.js";
export { HelpButton, type HelpButtonProps } from "./overlays/help-button.js";
export { ResetToContentButton } from "./widgets/reset-to-content-button.js";
export { LibraryPanel, type LibraryPanelProps } from "./panels/library-panel.js";
export {
  SelectionFloatingPanel,
  type SelectionFloatingPanelProps,
} from "./panels/selection-floating-panel.js";
export { Popover, type PopoverProps } from "./primitives/popover.js";
export { ColorSwatchPicker, type ColorSwatchPickerProps } from "./color/color-swatch-picker.js";
export {
  ELEMENT_PALETTE_LIGHT,
  ELEMENT_PALETTE_DARK,
  CANVAS_PALETTE_LIGHT,
  CANVAS_PALETTE_DARK,
  resolvePaletteTheme,
} from "./color/color-palette.js";
export {
  DiagramRoot,
  DiagramSurface,
  type DiagramRootProps,
  type DiagramSurfaceProps,
} from "./layout/diagram-root.js";
export { DiagramCanvas, type DiagramCanvasProps } from "./layout/diagram-canvas.js";
export { Minimap, type MinimapProps } from "./widgets/minimap.js";
export { DrawingPanel } from "./panels/drawing-panel.js";
export {
  useDiagram,
  useDiagramOptional,
  useScene,
  useSelection,
  useActiveTool,
  useBrushSettings,
  useReadOnly,
  useHistory,
  useLayers,
  useActiveLayerId,
  useAnnotations,
  useSelectedAnnotation,
  useSelectedLink,
  useMobileLayout,
} from "./core/hooks.js";
export { LayerPanel, type LayerPanelProps } from "./panels/layer-panel.js";
export {
  CommentsPanel,
  CommentsPopover,
  type CommentsPanelProps,
  type CommentsPopoverProps,
} from "./panels/comments-panel.js";
export { VersionPanel, useSnapshotStore, type VersionPanelProps } from "./widgets/versioning.js";
export { MergeDialog, type MergeDialogProps } from "./overlays/merge-dialog.js";
export { BottomSheet, type BottomSheetProps } from "./primitives/bottom-sheet.js";
export { FramePanel, type FramePanelProps } from "./panels/frame-panel.js";
export { Markdown, type MarkdownProps } from "./primitives/markdown.js";
export { TextEditorOverlay } from "./overlays/text-editor-overlay.js";
export { FrameNameEditorOverlay } from "./overlays/frame-name-editor-overlay.js";
export { LinkHoverPopup } from "./overlays/link-hover-popup.js";
export { LinkBadges } from "./overlays/link-badges.js";
export { StickyReactions } from "./overlays/sticky-reactions.js";
export { LinkDropShapeMenu } from "./menus/link-drop-shape-menu.js";
export { LinkCaptionEditor } from "./overlays/link-caption-editor.js";
export {
  Toolbar,
  DEFAULT_TOOLBAR,
  DEFAULT_VERTICAL_TOOLBAR,
  openImageFilePicker,
  ZoomWidget,
  ZoomInButton,
  ZoomOutButton,
  ResetZoomButton,
  ZoomToFitButton,
  ZoomDisplay,
  FloatingZoomControls,
  type ToolbarItem,
  type ToolbarProps,
  type ZoomButtonProps,
} from "./toolbar/toolbar.js";
export {
  Palette,
  usePaletteDropHandler,
  usePalettePlacement,
  usePaletteDrag,
  getActivePaletteDrag,
  subscribePaletteDrag,
  type PaletteProps,
} from "./toolbar/palette.js";
export { PropertyPanel, type PropertyPanelProps } from "./panels/property-panel.js";
export { LinkStylePanel, type LinkStylePanelProps } from "./panels/edge-style-panel.js";
export { DiffPanel, type DiffPanelProps } from "./panels/diff-panel.js";
export {
  ContextMenu,
  DEFAULT_CONTEXT_MENU,
  type ContextMenuItem,
  type ContextMenuContext,
  type ContextMenuProps,
} from "./menus/context-menu.js";
export {
  ContextMenuControllerProvider,
  useContextMenuController,
  type ContextMenuController,
  type ContextMenuOpenRequest,
} from "./menus/context-menu-controller.js";
export {
  HelpDialog,
  useHelpDialogHotkey,
  type HelpDialogProps,
  type HelpRow,
  type HelpSection,
} from "./overlays/help-dialog.js";
export { CommandPalette } from "./menus/command-palette.js";
export { SearchOverlay } from "./overlays/search-overlay.js";
export { StatsPanel } from "./panels/stats-panel.js";
export {
  ZenModeProvider,
  useZenMode,
  useZenModeOptional,
  type ZenModeApi,
} from "./widgets/zen-mode.js";
export {
  ToastHost,
  useToast,
  useToastOptional,
  useEphemeralToast,
  type Toast,
  type ToastApi,
  type ToastKind,
  type ToastHostProps,
} from "./primitives/toast.js";
export {
  MainMenu,
  type MainMenuProps,
  type MainMenuItemProps,
  type MainMenuItemLinkProps,
  type MainMenuSubmenuProps,
} from "./menus/main-menu.js";
export { Modal, type ModalProps } from "./primitives/modal.js";
export { Sidebar, type SidebarProps } from "./layout/sidebar.js";
export {
  Tooltip,
  TooltipProvider,
  type TooltipProps,
  type TooltipSide,
} from "./primitives/tooltip.js";
export { PortalContainerProvider, usePortalContainer } from "./core/portal-container.js";

// Tunable layout sizes for the built-in panels and toolbar.
export {
  PALETTE_WIDTH,
  PALETTE_ITEM_SIZE,
  PROPERTY_PANEL_WIDTH,
  PROPERTY_SWATCH_SIZE,
  MINIMAP_WIDTH_PX,
  MINIMAP_HEIGHT_PX,
  MINIMAP_PADDING_PX,
  MINIMAP_IDLE_MS,
  MINIMAP_BACKGROUND,
  MINIMAP_ELEMENT_COLOR,
  MINIMAP_ELEMENT_OPACITY,
  SEARCH_ZOOM_PADDING_PX,
} from "./core/constants.js";
