import {
  Fragment,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  useId,
} from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Group as GroupIcon,
  LayoutGrid,
  Ungroup as UngroupIcon,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  Bold,
  CaseSensitive,
  Download,
  Circle,
  Crop,
  Diamond,
  FileText,
  Hexagon as HexagonIcon,
  Highlighter,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListFilter,
  ListOrdered,
  Lock as LockIcon,
  MessageCircle,
  Minus,
  MoreHorizontal,
  MoreVertical,
  MoveRight,
  Proportions,
  RectangleHorizontal,
  RectangleVertical,
  SmilePlus,
  Spline,
  Square,
  Squircle,
  Star as StarIcon,
  StickyNote,
  SquareDashed,
  SquareDot,
  Tag,
  Strikethrough,
  Trash2,
  Tv,
  Underline,
  Upload,
  UserRound,
  Waypoints,
  Triangle as TriangleIcon,
  type LucideIcon,
} from "lucide-react";
import {
  getBinaryFile,
  isText,
  isImage,
  canCarryLabel,
  isSticky,
  isEmoji,
  isFrame,
  isGroup,
  getDescendantsOf,
  isRectangle,
  isEllipse,
  isBrush,
  isPolygon,
  sliceRuns,
  IMAGE_MASK_POLYGON_PRESETS,
  type ArrowheadStyle,
  type BrushElement,
  type Link,
  type LinkRouting,
  type Roundness,
  type ElementBase,
  type ImageMask,
  type Scene,
  type TextAlign,
  type TextBaseline,
  type TextElement,
  type TextStyle,
} from "@oh-just-another/scene";
import {
  FRAME_SIZE_PRESETS,
  LABEL_DEFAULT_FONT_SIZE,
  STICKY_SIZE_PRESETS,
  TEXT_DEFAULT_FONT_FAMILY,
  defaultActionRegistry,
  formatHotkey,
  type ConvertTarget,
  type HotkeyMatcher,
  type ImageAspectPreset,
} from "@oh-just-another/state";
import type { BinaryFile, EmojiElement, StickyElement } from "@oh-just-another/scene";
import type { FileId } from "@oh-just-another/types";
import {
  useDiagramOptional,
  useReadOnly,
  useScene,
  useSelectedLink,
  useSelection,
} from "../core/hooks.js";
import { useEditorSelector } from "../core/context.js";
import { useContextMenuController } from "../menus/context-menu-controller.js";
import { ColorSwatchPicker } from "../color/color-swatch-picker.js";
import { Popover } from "../primitives/popover.js";
import { SegmentedControl } from "../primitives/segmented-control.js";
import { Slider } from "../primitives/slider.js";
import {
  SEPARATOR,
  intersectControlSets,
  type ControlMode,
  type ControlSet,
  type ControlSetEntry,
} from "./control-sets.js";
import {
  BRUSH_WIDTH_MAX,
  BRUSH_WIDTH_MIN,
  TEXT_FONT_SIZE_MAX,
  TEXT_FONT_SIZE_MIN,
  TEXT_FONT_SIZE_PRESETS,
  TEXT_FONT_STACKS,
  EMOJI_QUICK_PICKS,
  IMAGE_MASK_DEFAULT_RADIUS,
  IMAGE_MASK_RADIUS_MAX_PCT,
  IMAGE_MASK_RADIUS_STEP_PCT,
  OPACITY_SLIDER_STEP,
  STROKE_DASH_PRESETS,
  DOTTED_DASH_MAX_SEGMENT,
  STROKE_WIDTH_PRESETS,
  STROKE_WIDTH_PRESET_ICON_THICKNESS,
  SWATCH_POPOVER_GAP_PX,
  CONTROL_ICON,
  SELECTION_DESCRIPTION_TYPES,
} from "../core/constants.js";

/**
 * Compact selection toolbar. A single horizontal row of controls that
 * reads the current selection and writes through `editor.updateStyle`.
 * Heavy sub-pickers (color, opacity slider, corner radius slider) live
 * behind `<Popover>` triggers so the row itself stays a small pill that
 * can float anywhere on the canvas.
 *
 * Multi-selection collapses each control's value to "mixed" when
 * members disagree; setting any value writes through to every selected
 * shape via `editor.updateStyle` (single undo step).
 *
 * Mounted by `<SelectionFloatingPanel>`.
 */
export interface PropertyPanelProps {
  readonly style?: CSSProperties;
  readonly className?: string;
  /**
   * Mobile bottom-sheet variant: a single row of the frequently-used
   * (primary) controls plus a vertical-dots button that expands the
   * sheet to reveal the rest (overflow). No property is dropped —
   * overflow is a regrouping, not a removal. Desktop (default) lays
   * everything out in one floating pill row.
   */
  readonly mobile?: boolean;
}

export const PropertyPanel = ({ style, className, mobile = false }: PropertyPanelProps) => {
  const selection = useSelection();
  const selectedLinkId = useSelectedLink();
  const scene = useScene();
  const readOnly = useReadOnly();

  // Every control here mutates the selection (style / text / z-order / align /
  // convert / delete / link). In read-only / view mode the whole panel is
  // suppressed — the canvas is view-only, so there's nothing to edit.
  if (readOnly) return null;

  // Dispatcher: edge wins only when no shape is selected — if both
  // happen to be set (rare), the shape panel is more useful. Each branch
  // splits its controls into `primary` (always visible) and `overflow`
  // (behind the ⋮ on mobile; inline on desktop).
  if (selection.size > 0) {
    const selected = [...selection]
      .map((id) => scene.elements.get(id))
      .filter((s): s is ElementBase => s !== undefined);
    if (selected.length === 0) return null;
    // A selected group stands for its leaf descendants (reference
    // behaviour): the toolbar shows — and writes — what those children share;
    // the group element itself carries no editable style.
    const targets = expandGroups(scene, selected);
    if (targets.length === 0) return null;
    const single = targets.length === 1;
    // Per-element control sets, intersected by control id for ≥2 targets
    // (see control-sets.ts): uniform selections keep their type's multi set,
    // mixed ones keep only what every member offers.
    const set = intersectControlSets(
      targets.map((s) => controlSetFor(s, single ? "single" : "multi")),
    );
    const primary = renderControlSet(set.primary, targets);
    const overflow = renderControlSet(set.overflow, targets);
    // Mixed types: a Filter that narrows the actual selection to one type
    // bucket leads the row, so the per-type controls come back on demand.
    if (!single && selectionBuckets(targets).size > 1) {
      primary.unshift(<SelectionFilterControl key="filter" shapes={targets} />);
    }
    // Shared tail: `arrange · group · ungroup | comment | lock | ⋯`.
    // Arrange / group / ungroup gate themselves on the selection; comment is
    // single-only; z-order, duplicate / delete and flip stay in the context
    // menu (⋯).
    overflow.push(
      <Divider key="d-arrange" />,
      <ArrangeControl key="arrange" targets={targets} />,
      <GroupControls key="group" selected={selected} />,
      <Divider key="d-comment" />,
    );
    if (single) overflow.push(<CommentControl key="comment" shapes={targets} />);
    overflow.push(<Divider key="d-lock" />, <LockControl key="lock" />, <MoreButton key="more" />);
    return (
      <PanelShell
        mobile={mobile}
        primary={primary}
        overflow={overflow}
        className={className}
        style={style}
        description={single ? undefined : describeSelection(targets)}
      />
    );
  }

  if (selectedLinkId !== null) {
    const edge = scene.links.get(selectedLinkId);
    if (!edge) return null;
    const primary: ReactNode[] = [
      <LinkStrokeColorControl key="color" edge={edge} />,
      <LinkStrokeWidthControl key="width" edge={edge} />,
      <LinkArrowheadControl key="arrow-to" edge={edge} side="to" />,
    ];
    const overflow: ReactNode[] = [
      <LinkStrokeStyleControl key="dash" edge={edge} />,
      <LinkRoutingControl key="routing" edge={edge} />,
      <LinkLineKindControl key="kind" edge={edge} />,
      <LinkArrowheadControl key="arrow-from" edge={edge} side="from" />,
      <LinkAutoRouteControl key="auto" edge={edge} />,
      <LinkDeleteControl key="delete" />,
      <MoreButton key="more" />,
    ];
    return (
      <PanelShell
        mobile={mobile}
        primary={primary}
        overflow={overflow}
        className={className}
        style={style}
      />
    );
  }
  return null;
};

/**
 * Lays out the primary / overflow control groups. Desktop = one floating
 * pill row (primary · divider · overflow). Mobile = a primary row with a
 * vertical-dots ⋮ that expands a wrapped overflow grid below it.
 */
// ---------------------------------------------------------------------------
// Control sets (see control-sets.ts) — what each element type offers
// ---------------------------------------------------------------------------

type ControlRender = (targets: readonly ElementBase[]) => ReactNode;
type PanelControlSet = ControlSet<ControlRender>;
type PanelEntry = ControlSetEntry<ControlRender>;

const control = (id: string, render: ControlRender): PanelEntry => ({ id, payload: render });

/**
 * The text-carrying view of an element: text elements as they are, labelable
 * shapes through their embedded label (`labelView`), so one control reads
 * font / style / colour off a shape + text selection alike. Writes go through
 * the label-aware `editor.updateTextStyle` / `updateTextProps`.
 */
const textView = (s: ElementBase): ElementBase => (isText(s) ? s : labelView(s));
const textViews = (targets: readonly ElementBase[]): ElementBase[] => targets.map(textView);

/** Shared text-carrier cluster ids — identical for text and labelled shapes. */
const TEXT_CLUSTER: readonly PanelEntry[] = [
  control("font-family", (t) => <FontFamilyControl shapes={textViews(t)} />),
  control("font-size", (t) => <FontSizeControl shapes={textViews(t)} />),
  control("text-decoration", (t) => <TextDecorationControl shapes={textViews(t)} />),
  control("text-align", (t) => <TextAlignControl shapes={textViews(t)} />),
];
const TEXT_COLOR_CLUSTER: readonly PanelEntry[] = [
  control("text-color", (t) => <ColorOpacityControl shapes={textViews(t)} />),
  control("highlight", (t) => <HighlightControl shapes={textViews(t)} />),
];
const CONVERT: PanelEntry = control("convert", (t) => <ConvertTypeControl shapes={t} />);
const LINK: PanelEntry = control("link", (t) => <LinkControl shapes={t} />);

/**
 * Ordered controls one element offers. `multi` is the single set minus what
 * makes no sense for several elements: the hyperlink, the text list type,
 * per-file image actions, the frame ratio. Sticky notes use their own
 * font ids (auto-size font, note fonts) so a note + shape selection shares
 * only the style / alignment controls, as in the reference.
 */
const controlSetFor = (s: ElementBase, mode: ControlMode): PanelControlSet => {
  const single = mode === "single";
  const convert: PanelEntry[] = isConvertible(s) ? [CONVERT, SEPARATOR] : [];
  if (isSticky(s)) {
    return {
      primary: [
        ...convert,
        control("sticky-font-family", (t) => <FontFamilyControl shapes={textViews(t)} />),
        control("sticky-font-size", (t) => <FontSizeControl shapes={textViews(t)} allowAuto />),
        ...TEXT_CLUSTER.slice(2),
        SEPARATOR,
        control("sticky-size", (t) => <StickySizeControl shapes={t} />),
        control("sticky-bg", (t) => <FillOpacityControl shapes={t} />),
      ],
      overflow: [
        control("sticky-tags", (t) => <StickyTagControl shapes={t} />),
        control("sticky-author", (t) => <StickyAuthorControl shapes={t} />),
      ],
    };
  }
  if (isEmoji(s)) {
    return { primary: [control("emoji", (t) => <EmojiPickerControl shapes={t} />)], overflow: [] };
  }
  if (isFrame(s)) {
    // A frame's border is fixed chrome; only its body fill is configurable.
    return {
      primary: [
        control("frame-fill", (t) => <FillControl shapes={t} />),
        ...(single ? [control("frame-ratio", (t) => <FrameRatioControl shapes={t} />)] : []),
      ],
      overflow: single ? [LINK] : [],
    };
  }
  if (isText(s)) {
    return {
      primary: [
        ...convert,
        ...TEXT_CLUSTER,
        ...(single ? [control("list", (t) => <ListControl shapes={t} />)] : []),
      ],
      overflow: [...(single ? [LINK, SEPARATOR] : []), ...TEXT_COLOR_CLUSTER],
    };
  }
  if (isImage(s)) {
    // Pixels are the content — no fill / stroke. Per-file actions are
    // single-only; crop / mask / opacity apply in bulk.
    return {
      primary: single ? [control("image-name", (t) => <ImageNameControl shapes={t} />)] : [],
      overflow: [
        ...(single
          ? [
              control("image-replace", (t) => <ReplaceImageControl shapes={t} />),
              control("image-download", (t) => <DownloadImageControl shapes={t} />),
              control("image-alt", (t) => <ImageAltControl shapes={t} />),
              SEPARATOR,
            ]
          : []),
        control("image-crop", (t) => <CropControl shapes={t} />),
        control("image-mask", (t) => <MaskControl shapes={t} />),
        control("image-opacity", (t) => <OpacityControl shapes={t} />),
      ],
    };
  }
  if (isGroup(s)) return { primary: [], overflow: [] };
  const body: PanelEntry[] = isBrush(s)
    ? [
        // Brush widths are baked per point — `style.strokeWidth` has no
        // effect, so brushes get a slider that re-bases the baked widths.
        control("stroke", (t) => <StrokeControl shapes={t} />),
        control("brush-width", (t) => <BrushWidthControl shapes={t} />),
      ]
    : [
        control("border", (t) => <BorderGroupControl shapes={t} />),
        control("fill", (t) => <FillOpacityControl shapes={t} />),
      ];
  return {
    primary: [
      ...convert,
      ...(canCarryLabel(s) ? [...TEXT_CLUSTER, ...TEXT_COLOR_CLUSTER, SEPARATOR] : []),
      ...body,
    ],
    overflow: single ? [LINK] : [],
  };
};

const renderControlSet = (
  entries: readonly PanelEntry[],
  targets: readonly ElementBase[],
): ReactNode[] =>
  entries.map((e, i) =>
    e === SEPARATOR ? (
      <Divider key={`sep-${String(i)}`} />
    ) : (
      <Fragment key={e.id}>{e.payload(targets)}</Fragment>
    ),
  );

/**
 * Replace every selected group by its leaf descendants (nested groups
 * flattened); plain elements pass through. Order and uniqueness preserved.
 */
const expandGroups = (scene: Scene, selected: readonly ElementBase[]): ElementBase[] => {
  const out: ElementBase[] = [];
  const seen = new Set<string>();
  const push = (s: ElementBase): void => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push(s);
  };
  for (const s of selected) {
    if (!isGroup(s)) {
      push(s);
      continue;
    }
    for (const d of getDescendantsOf(scene, s.id)) if (!isGroup(d)) push(d);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Tail: arrange / group / ungroup (registry-driven)
// ---------------------------------------------------------------------------

const ARRANGE_ALIGN: readonly { readonly id: string; readonly Icon: typeof AlignStartVertical }[] =
  [
    { id: "align-left", Icon: AlignStartVertical },
    { id: "align-h-center", Icon: AlignCenterVertical },
    { id: "align-right", Icon: AlignEndVertical },
    { id: "align-top", Icon: AlignStartHorizontal },
    { id: "align-v-center", Icon: AlignCenterHorizontal },
    { id: "align-bottom", Icon: AlignEndHorizontal },
  ];
const ARRANGE_DISTRIBUTE: readonly {
  readonly id: string;
  readonly Icon: typeof AlignStartVertical;
}[] = [
  { id: "distribute-horizontal", Icon: AlignHorizontalDistributeCenter },
  { id: "distribute-vertical", Icon: AlignVerticalDistributeCenter },
];

/** One registry action as a toolbar / popover button (disabled by its predicate). */
const ActionIconButton = ({
  id,
  Icon,
}: {
  readonly id: string;
  readonly Icon: typeof AlignStartVertical;
}) => {
  const editor = useDiagramOptional();
  const action = defaultActionRegistry.get(id);
  if (!editor || !action) return null;
  const enabled = action.predicate ? action.predicate({ editor }) : true;
  const matchers: readonly HotkeyMatcher[] =
    action.hotkey === undefined
      ? []
      : Array.isArray(action.hotkey)
        ? action.hotkey
        : [action.hotkey];
  const first = matchers[0];
  const label = action.label ?? id;
  return (
    <button
      type="button"
      className="du-sel-icon-button"
      aria-label={label}
      title={first ? `${label} (${formatHotkey(first)})` : label}
      disabled={!enabled}
      onClick={() => {
        defaultActionRegistry.dispatch(id, { editor });
      }}
    >
      <Icon {...CONTROL_ICON} aria-hidden />
    </button>
  );
};

/**
 * Arrange popover for ≥2 targets: align (left / centre / right, top /
 * middle / bottom) and distribute (horizontally / vertically, from 3). The
 * buttons follow the registry predicates, so a single whole group — two
 * children but one selected id — shows them disabled, as in the reference.
 */
const ArrangeControl = ({ targets }: { readonly targets: readonly ElementBase[] }) => {
  if (targets.length < 2) return null;
  return (
    <Popover
      ariaLabel="Arrange"
      trigger={
        <button type="button" className="du-sel-icon-button" aria-label="Arrange" title="Arrange">
          <LayoutGrid {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Align</header>
        <div className="du-sel-arrange-row">
          {ARRANGE_ALIGN.map((a) => (
            <ActionIconButton key={a.id} id={a.id} Icon={a.Icon} />
          ))}
        </div>
        <header className="du-sel-popover-label">Distribute</header>
        <div className="du-sel-arrange-row">
          {ARRANGE_DISTRIBUTE.map((a) => (
            <ActionIconButton key={a.id} id={a.id} Icon={a.Icon} />
          ))}
        </div>
      </div>
    </Popover>
  );
};

/**
 * Group / Ungroup buttons. Group needs ≥2 selected ids; Ungroup needs a
 * group among them (both show for a group + something else). Neither shows
 * while editing inside a group (double-clicked in): the children are being
 * edited in place, not regrouped.
 */
const GroupControls = ({ selected }: { readonly selected: readonly ElementBase[] }) => {
  const enteredGroup = useEditorSelector((e) => e.enteredGroup, null);
  if (enteredGroup !== null) return null;
  const hasGroup = selected.some((s) => isGroup(s));
  return (
    <>
      {selected.length >= 2 ? <ActionIconButton id="group-selection" Icon={GroupIcon} /> : null}
      {hasGroup ? <ActionIconButton id="ungroup-selection" Icon={UngroupIcon} /> : null}
    </>
  );
};

/**
 * Screen-reader summary of a multi-selection: the count and the first
 * `SELECTION_DESCRIPTION_TYPES` element types ("3 elements: rectangle,
 * text, sticky"). Visual users see the row of controls; this is the
 * `aria-describedby` of the toolbar.
 */
const describeSelection = (targets: readonly ElementBase[]): string => {
  const types: string[] = [];
  for (const t of targets) {
    if (!types.includes(t.type)) types.push(t.type);
    if (types.length === SELECTION_DESCRIPTION_TYPES) break;
  }
  const more = targets.some((t) => !types.includes(t.type));
  return `${String(targets.length)} elements: ${types.join(", ")}${more ? ", …" : ""}`;
};

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

const PanelShell = ({
  mobile,
  primary,
  overflow,
  className,
  style,
  description,
}: {
  readonly mobile: boolean;
  readonly primary: readonly ReactNode[];
  readonly overflow: readonly ReactNode[];
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** `aria-describedby` text for the toolbar (multi-selection summary). */
  readonly description?: string | undefined;
}) => {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const descriptionId = useId();
  const a11y = {
    role: "toolbar" as const,
    "aria-label": "Selection",
    ...(description === undefined ? {} : { "aria-describedby": descriptionId }),
  };
  const hidden =
    description === undefined ? null : (
      <span id={descriptionId} style={VISUALLY_HIDDEN}>
        {description}
      </span>
    );
  // Collapse the expanded overflow sheet on a tap outside the panel.
  // The ⋮ button and the grabber collapse it directly; this covers taps
  // on the canvas / elsewhere.
  useEffect(() => {
    if (!mobile || !expanded) return undefined;
    const onDown = (e: PointerEvent): void => {
      const el = panelRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setExpanded(false);
    };
    // `capture` so we see the tap even if something stops propagation.
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [mobile, expanded]);

  if (!mobile) {
    return (
      <div className={`du-sel-panel ${className ?? ""}`.trim()} style={style} {...a11y}>
        {hidden}
        {groupControls([...primary, <Divider key="d-overflow" />, ...overflow])}
      </div>
    );
  }
  return (
    <div
      ref={panelRef}
      className={`du-sel-panel du-sel-panel-mobile ${className ?? ""}`.trim()}
      style={style}
      {...a11y}
    >
      {hidden}
      <div className="du-sel-mobile-row">
        <div className="du-sel-mobile-primary">{groupControls(primary)}</div>
        {overflow.length > 0 ? (
          <button
            type="button"
            className={`du-sel-icon-button du-sel-mobile-expand${expanded ? " is-active" : ""}`}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide more properties" : "More properties"}
            title="More properties"
            onClick={() => {
              setExpanded((v) => !v);
            }}
          >
            <MoreVertical {...CONTROL_ICON} aria-hidden />
          </button>
        ) : null}
      </div>
      {expanded && overflow.length > 0 ? (
        <div className="du-sel-mobile-overflow">{groupControls(overflow)}</div>
      ) : null}
    </div>
  );
};

/**
 * Element link control. One trigger (chain icon, active when a link is
 * set) opens a popover with a URL field plus Save / Open / Remove. Works
 * for any shape — the href lives on `ElementBase`. The URL is normalised
 * (`normalizeHref`: adds `https://`, `mailto:`, rejects `javascript:`)
 * before storing. Multi-select applies to all.
 */
const LinkControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const inputRef = useRef<HTMLInputElement>(null);
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const current = sharedString(shapes, (s) => (s as { href?: string }).href);
  const hasLink = shapes.some((s) => Boolean((s as { href?: string }).href));
  const save = (raw: string): void => {
    editor.setLink(ids, raw);
  };
  return (
    <Popover
      ariaLabel="Link"
      trigger={
        <button
          type="button"
          className={`du-sel-icon-button${hasLink ? " is-active" : ""}`}
          title="Link"
          aria-label="Link"
        >
          <LinkIcon {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Link</header>
        <input
          ref={inputRef}
          className="du-sel-link-input"
          type="text"
          placeholder="https://…  ·  name@mail"
          defaultValue={current ?? ""}
          aria-label="Link URL"
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              save(ev.currentTarget.value);
            }
          }}
        />
        <div style={{ display: "flex", gap: 2 }}>
          <button
            type="button"
            className="du-sel-text-button"
            onClick={() => {
              save(inputRef.current?.value ?? "");
            }}
          >
            Save
          </button>
          {hasLink ? (
            <button
              type="button"
              className="du-sel-text-button"
              onClick={() => {
                editor.openLink(current);
              }}
            >
              Open
            </button>
          ) : null}
          {hasLink ? (
            <button
              type="button"
              className="du-sel-text-button"
              onClick={() => {
                editor.setLink(ids, null);
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </Popover>
  );
};

/**
 * Start a comment thread on the selected element: adds an annotation pin
 * anchored to the (first) selected shape and selects it, which opens the
 * comment thread UI. Same backing model as the context menu's
 * "Add comment" — this is just the toolbar affordance for it.
 */
const CommentControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const first = shapes[0];
  if (!editor || !first) return null;
  return (
    <button
      type="button"
      className="du-sel-icon-button"
      title="Add comment"
      aria-label="Add comment"
      onClick={() => {
        editor.addAnnotation({ position: { x: 0, y: 0 }, elementId: first.id });
      }}
    >
      <MessageCircle {...CONTROL_ICON} aria-hidden />
    </button>
  );
};

/**
 * Lock the current selection. Locked shapes become click-through (the
 * hit-test skips them), so locking also drops the selection and hides
 * this panel; unlocking goes through the right-click context menu.
 */
const LockControl = () => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  return (
    <button
      type="button"
      className="du-sel-icon-button"
      title="Lock"
      aria-label="Lock selection"
      onClick={() => {
        editor.toggleLockSelection();
      }}
    >
      <LockIcon {...CONTROL_ICON} aria-hidden />
    </button>
  );
};

const MoreButton = () => {
  const editor = useDiagramOptional();
  const controller = useContextMenuController();
  if (!editor || !controller) return null;
  return (
    <button
      type="button"
      className="du-sel-icon-button"
      title="More actions"
      aria-label="More actions"
      onClick={(ev) => {
        const rect = ev.currentTarget.getBoundingClientRect();
        const screenPoint = { x: rect.left, y: rect.bottom + SWATCH_POPOVER_GAP_PX };
        const host = editor.hostElement as HTMLElement | null;
        const hostRect = host?.getBoundingClientRect();
        const worldPoint = hostRect
          ? editor.screenToWorld({
              x: screenPoint.x - hostRect.left,
              y: screenPoint.y - hostRect.top,
            })
          : { x: 0, y: 0 };
        controller.open({ screenPoint, worldPoint });
      }}
    >
      <MoreHorizontal {...CONTROL_ICON} aria-hidden />
    </button>
  );
};

// ---------------------------------------------------------------------------
// Inline controls
// ---------------------------------------------------------------------------

/**
 * Color trigger: a 24×24 square button with a colored fill plus an
 * outer ring, opens the full swatch picker in a popover.
 */
const ColorTrigger = ({
  label,
  color,
  onChange,
  ariaLabel,
  onEyedrop,
}: {
  readonly label: string;
  readonly color: string | null;
  readonly onChange: (c: string | null) => void;
  readonly ariaLabel: string;
  readonly onEyedrop?: (onPicked: (color: string) => void) => void;
}) => (
  <Popover
    ariaLabel={ariaLabel}
    trigger={
      <button type="button" className="du-sel-color-trigger" title={label} aria-label={ariaLabel}>
        <span
          className="du-sel-color-swatch"
          style={{
            background:
              !color || color === "transparent"
                ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 6px 6px"
                : color,
          }}
        />
      </button>
    }
  >
    <div className="du-sel-popover-section">
      <header className="du-sel-popover-label">{label}</header>
      <ColorSwatchPicker value={color} onChange={onChange} {...(onEyedrop ? { onEyedrop } : {})} />
    </div>
  </Popover>
);

/**
 * Active inline-text-edit selection over a single shown text element, if any.
 * When present, text-style controls (colour, bold/italic/…) target JUST the
 * selected characters — producing styled runs (rich text) — instead of the
 * whole element. `null` when there is no inline edit, the selection is
 * collapsed, or the edited element isn't in the panel's `shapes`.
 */
interface TextRunRange {
  readonly target: TextElement;
  readonly from: number;
  readonly to: number;
}
const useTextRunRange = (shapes: readonly ElementBase[]): TextRunRange | null => {
  const editingId = useEditorSelector((e) => e.editingTextElement, null);
  const sel = useEditorSelector((e) => e.editingTextSelection, null);
  if (editingId === null || sel === null || sel.start === sel.end) return null;
  const target = shapes.find((s) => s.id === editingId);
  if (target === undefined) return null;
  if (!isText(target) && !("text" in target && target.label !== undefined)) return null;
  return {
    target: target as TextElement,
    from: Math.min(sel.start, sel.end),
    to: Math.max(sel.start, sel.end),
  };
};

/**
 * Combined color & opacity control — a single swatch trigger whose
 * popover has both the palette and an opacity slider. Used for the text
 * panel in place of separate Fill + Opacity triggers. Writes `fill` and
 * `opacity` through `editor.updateTextStyle` (element style for text,
 * label style for labelable shapes).
 */
const ColorOpacityControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const runRange = useTextRunRange(shapes);
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const color = sharedString(shapes, (s) => s.style.fill);
  const opacity = sharedValue<number>(shapes, (s) => s.style.opacity ?? 1);
  const pct = opacity === null ? null : Math.round(opacity * 100);
  const swatchBg =
    !color || color === "transparent"
      ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 6px 6px"
      : color;
  return (
    <Popover
      ariaLabel="Text color and opacity"
      trigger={
        <button
          type="button"
          className="du-sel-color-trigger"
          title="Text color & opacity"
          aria-label="Text color and opacity"
        >
          <span
            className="du-sel-color-swatch"
            style={{ background: swatchBg, opacity: opacity ?? 1 }}
          />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Text color</header>
        <ColorSwatchPicker
          value={color}
          onChange={(v) => {
            // In-edit text selection → colour just those characters (runs);
            // otherwise colour the whole element(s) / label(s).
            if (runRange) {
              editor.applyTextStyleToRange(runRange.target.id, runRange.from, runRange.to, {
                fill: v ?? "transparent",
              });
            } else {
              editor.updateTextStyle(ids, { fill: v ?? "transparent" });
            }
          }}
          onEyedrop={(cb) => {
            editor.beginEyedropperPick(cb);
          }}
        />
        <header className="du-sel-popover-label">Opacity</header>
        <Slider
          value={pct}
          min={0}
          max={100}
          step={OPACITY_SLIDER_STEP}
          ariaLabel="Opacity"
          valueLabel={pct === null ? "—" : `${pct}%`}
          onChange={(v) => {
            editor.updateTextStyle(ids, { opacity: v / 100 });
          }}
        />
      </div>
    </Popover>
  );
};

/** Sticky size presets (S / M / L squares). */
const StickySizeControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const side = sharedValue<number>(shapes, (s) => (s as StickyElement).width);
  return (
    <SegmentedControl<number>
      ariaLabel="Sticky size"
      value={side}
      options={STICKY_SIZE_PRESETS.map((p) => ({
        value: p.side,
        label: p.id.toUpperCase(),
        icon: <span className="du-sel-size-letter">{p.id.toUpperCase()}</span>,
      }))}
      onChange={(v) => {
        editor.setStickySize(ids, v);
      }}
    />
  );
};

/** Tag editor for sticky notes: pills with remove + an input that adds on Enter. */
const StickyTagControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const first = shapes[0];
  if (!editor || !first) return null;
  const tags = (first as StickyElement).tags ?? [];
  const ids = shapes.map((s) => s.id);
  return (
    <Popover
      ariaLabel="Tags"
      trigger={
        <button type="button" className="du-sel-icon-button" title="Add tag" aria-label="Add tag">
          <Tag {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Tags</header>
        {tags.length > 0 ? (
          <div className="du-sel-tag-list">
            {tags.map((tag) => (
              <span key={tag} className="du-sel-tag-pill">
                {tag}
                <button
                  type="button"
                  className="du-sel-tag-remove"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => {
                    editor.setStickyTags(
                      ids,
                      tags.filter((t) => t !== tag),
                    );
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <input
          type="text"
          className="du-sel-name-input"
          placeholder="Add tag…"
          aria-label="New tag"
          onKeyDown={(ev) => {
            if (ev.key !== "Enter") return;
            ev.preventDefault();
            const value = ev.currentTarget.value.trim();
            if (value === "" || tags.includes(value)) return;
            editor.setStickyTags(ids, [...tags, value]);
            ev.currentTarget.value = "";
          }}
        />
      </div>
    </Popover>
  );
};

/** Toggle the author-name strip along the sticky's bottom edge. */
const StickyAuthorControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const on = shapes.every((s) => (s as StickyElement).showAuthor === true);
  return (
    <button
      type="button"
      className={`du-sel-icon-button${on ? " is-active" : ""}`}
      title="Show author"
      aria-label="Show author"
      aria-pressed={on}
      onClick={() => {
        editor.toggleStickyAuthor(ids);
      }}
    >
      <UserRound {...CONTROL_ICON} aria-hidden />
    </button>
  );
};

/** Emoji picker: replace the element's glyph with one of the presets. */
const EmojiPickerControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const first = shapes[0];
  if (!editor || !first) return null;
  const current = (first as EmojiElement).glyph;
  return (
    <Popover
      ariaLabel="Choose emoji"
      trigger={
        <button
          type="button"
          className="du-sel-text-button"
          title="Choose emoji"
          aria-label="Choose emoji"
        >
          {current}
        </button>
      }
    >
      <div className="du-sel-emoji-grid">
        {EMOJI_QUICK_PICKS.map((glyph) => (
          <button
            key={glyph}
            type="button"
            className="du-sel-emoji-item"
            aria-label={`Emoji ${glyph}`}
            onClick={() => {
              editor.setEmojiGlyph(
                shapes.map((s) => s.id),
                glyph,
              );
            }}
          >
            {glyph}
          </button>
        ))}
      </div>
    </Popover>
  );
};

/**
 * Grouped border editor: stroke color, width, dash style and corner
 * rounding in ONE popover ("border style, opacity, corners and color").
 * Every write goes through `editor.updateStyle` on the whole selection.
 */
const BorderGroupControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const stroke = sharedString(shapes, (s) => s.style.stroke);
  const width = sharedValue<number>(shapes, (s) => s.style.strokeWidth ?? 1);
  const dash = sharedValue<string>(shapes, (s) => {
    const d = s.style.dashArray;
    if (!d || d.length === 0) return "solid";
    return (d[0] ?? 0) <= 2 ? "dotted" : "dashed";
  });
  const round = sharedValue<"sharp" | "round">(shapes, (s) => s.style.roundness?.type ?? "sharp");
  const roundable = shapes.some((s) => isRectangle(s));
  return (
    <Popover
      ariaLabel="Border style"
      trigger={
        <button
          type="button"
          className="du-sel-color-trigger"
          title="Border style, corners and color"
          aria-label="Border style, corners and color"
        >
          <span
            className="du-sel-color-swatch du-sel-swatch-ring"
            style={{ borderColor: stroke ?? "var(--menu-border)" }}
          />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Border color</header>
        <ColorSwatchPicker
          value={stroke}
          onChange={(v) => {
            editor.updateStyle(ids, { stroke: v ?? "transparent" });
          }}
          onEyedrop={(cb) => {
            editor.beginEyedropperPick(cb);
          }}
        />
        <header className="du-sel-popover-label">Width</header>
        <SegmentedControl<number>
          ariaLabel="Border width"
          value={width}
          options={[
            ...STROKE_WIDTH_PRESETS.map((p, i) => ({
              ...p,
              icon: (
                <StrokeWidthIcon thickness={STROKE_WIDTH_PRESET_ICON_THICKNESS[i] ?? p.value} />
              ),
            })),
          ]}
          onChange={(v) => {
            editor.updateStyle(ids, { strokeWidth: v });
          }}
        />
        <header className="du-sel-popover-label">Style</header>
        <SegmentedControl<string>
          ariaLabel="Border dash style"
          value={dash}
          options={[
            { value: "solid", label: "Solid", icon: <Square {...CONTROL_ICON} /> },
            {
              value: "dashed",
              label: "Dashed",
              icon: <SquareDashed {...CONTROL_ICON} />,
            },
            { value: "dotted", label: "Dotted", icon: <SquareDot {...CONTROL_ICON} /> },
          ]}
          onChange={(v) => {
            editor.updateStyle(ids, {
              dashArray:
                v === "solid"
                  ? []
                  : v === "dashed"
                    ? [...STROKE_DASH_PRESETS.dashed]
                    : [...STROKE_DASH_PRESETS.dotted],
            });
          }}
        />
        {roundable ? (
          <>
            <header className="du-sel-popover-label">Corners</header>
            <SegmentedControl<"sharp" | "round">
              ariaLabel="Corner rounding"
              value={round}
              options={[
                { value: "sharp", label: "Sharp", icon: <CornerIcon kind="sharp" /> },
                { value: "round", label: "Round", icon: <CornerIcon kind="round" /> },
              ]}
              onChange={(v) => {
                editor.updateStyle(ids, { roundness: { type: v } });
              }}
            />
          </>
        ) : null}
      </div>
    </Popover>
  );
};

/**
 * Grouped fill editor: fill color + opacity in one popover
 * ("set color and opacity").
 */
const FillOpacityControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some(hasFill)) return null;
  const ids = shapes.map((s) => s.id);
  const fill = sharedString(shapes, (s) => s.style.fill);
  const opacity = sharedValue<number>(shapes, (s) => s.style.opacity ?? 1);
  const pct = opacity === null ? null : Math.round(opacity * 100);
  const swatchBg =
    !fill || fill === "transparent"
      ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 6px 6px"
      : fill;
  return (
    <Popover
      ariaLabel="Fill color and opacity"
      trigger={
        <button
          type="button"
          className="du-sel-color-trigger"
          title="Fill color & opacity"
          aria-label="Fill color and opacity"
        >
          <span
            className="du-sel-color-swatch"
            style={{ background: swatchBg, opacity: opacity ?? 1 }}
          />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Fill</header>
        <ColorSwatchPicker
          value={fill}
          onChange={(v) => {
            editor.updateStyle(ids, { fill: v ?? "transparent" });
          }}
          onEyedrop={(cb) => {
            editor.beginEyedropperPick(cb);
          }}
        />
        <header className="du-sel-popover-label">Opacity</header>
        <Slider
          value={pct}
          min={0}
          max={100}
          step={OPACITY_SLIDER_STEP}
          ariaLabel="Fill opacity"
          valueLabel={pct === null ? "—" : `${String(pct)}%`}
          onChange={(v) => {
            editor.updateStyle(ids, { opacity: v / 100 });
          }}
        />
      </div>
    </Popover>
  );
};

/**
 * Frame size presets (paper / screen ratios) as a dropdown. Applying one
 * resizes the frame to the canonical size; free resize simply diverges
 * (Custom is implicit — nothing is stored on the element).
 */
const FrameRatioControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const first = shapes[0];
  if (!editor || !first) return null;
  return (
    <Popover
      ariaLabel="Frame size"
      trigger={
        <button
          type="button"
          className="du-sel-icon-button"
          title="Frame size"
          aria-label="Frame size"
        >
          <Proportions {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Frame size</header>
        <div className="du-sel-preset-list">
          {FRAME_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="du-sel-preset-item"
              onClick={() => {
                editor.applyFramePreset(first.id, preset);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </Popover>
  );
};

/** The backing BinaryFile of a single-image selection, if any. */
const backingFile = (
  editor: NonNullable<ReturnType<typeof useDiagramOptional>>,
  shapes: readonly ElementBase[],
): {
  readonly elementId: ElementBase["id"];
  readonly fileId: FileId;
  readonly file: BinaryFile;
} | null => {
  const first = shapes[0];
  if (!first || !isImage(first) || first.fileId === undefined) return null;
  const file = getBinaryFile(editor.scene, first.fileId);
  return file ? { elementId: first.id, fileId: first.fileId, file } : null;
};

/**
 * File-name input for a single selected image backed by a registered
 * binary file. Commits on Enter / blur through the editor (undoable);
 * images without a file registry entry (raw `src`) hide the control.
 */
const ImageNameControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const backing = backingFile(editor, shapes);
  if (!backing) return null;
  const commit = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed.length > 0) editor.renameBinaryFile(backing.fileId, trimmed);
  };
  return (
    <input
      key={backing.file.name ?? backing.fileId}
      type="text"
      className="du-sel-name-input"
      defaultValue={backing.file.name ?? ""}
      placeholder="File name"
      aria-label="File name"
      onBlur={(ev) => {
        commit(ev.currentTarget.value);
      }}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commit(ev.currentTarget.value);
          ev.currentTarget.blur();
        }
      }}
    />
  );
};

/**
 * Pick a new media file (image / GIF / video) and swap it under the
 * selected shape. Position and width are kept (height refits to the new
 * aspect); the crop resets when the media kind changes.
 */
const ReplaceImageControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const first = shapes[0];
  if (!editor || !first || !isImage(first)) return null;
  return (
    <>
      <button
        type="button"
        className="du-sel-icon-button"
        title="Replace media"
        aria-label="Replace media"
        onClick={() => {
          inputRef.current?.click();
        }}
      >
        <Upload {...CONTROL_ICON} aria-hidden />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,.gif,.mp4,.webm,.mov"
        style={{ display: "none" }}
        onChange={(ev) => {
          const file = ev.currentTarget.files?.[0];
          ev.currentTarget.value = "";
          if (file) void editor.replaceImageFile(first.id, file, file.name);
        }}
      />
    </>
  );
};

/** Download the image's original bytes with their stored name / mime. */
const DownloadImageControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const backing = backingFile(editor, shapes);
  if (!backing) return null;
  return (
    <button
      type="button"
      className="du-sel-icon-button"
      title="Download image"
      aria-label="Download image"
      onClick={() => {
        const blob = new Blob([backing.file.data], { type: backing.file.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = backing.file.name ?? "image";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }}
    >
      <Download {...CONTROL_ICON} aria-hidden />
    </button>
  );
};

/** Alt-text editor (accessible description) for the selected image. */
const ImageAltControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const first = shapes[0];
  if (!editor || !first || !isImage(first)) return null;
  const current = first.alt ?? "";
  return (
    <Popover
      ariaLabel="Alt text"
      trigger={
        <button type="button" className="du-sel-icon-button" title="Alt text" aria-label="Alt text">
          <FileText {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Alt text</header>
        <textarea
          className="du-sel-alt-input"
          defaultValue={current}
          rows={3}
          placeholder="Describe this image"
          aria-label="Alt text"
          onBlur={(ev) => {
            const value = ev.currentTarget.value.trim();
            if (value !== current) editor.setImageAlt([first.id], value === "" ? null : value);
          }}
        />
      </div>
    </Popover>
  );
};

/**
 * Text lists as a two-row dropdown block: list kind (bulleted / ordered)
 * over nesting (decrease / increase indent). While inline-editing, the
 * operations target the paragraphs under the caret / selection; otherwise
 * the whole element. Clicking the active kind again clears it.
 */
const ListControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const kind = sharedValue<"bullet" | "numbered" | "none">(shapes, (s) => {
    const paragraphs = (s as TextElement).paragraphs ?? [];
    const first = paragraphs[0]?.list;
    if (first === undefined) return "none";
    return paragraphs.every((p) => p.list === first) ? first : "none";
  });
  return (
    <Popover
      ariaLabel="List"
      trigger={
        <button type="button" className="du-sel-icon-button" title="List" aria-label="List">
          <List {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-align-rows">
        <SegmentedControl<"bullet" | "numbered">
          ariaLabel="List kind"
          value={kind === "none" ? null : kind}
          options={[
            {
              value: "bullet",
              label: "Bulleted list",
              icon: <List {...CONTROL_ICON} />,
            },
            {
              value: "numbered",
              label: "Ordered list",
              icon: <ListOrdered {...CONTROL_ICON} />,
            },
          ]}
          onChange={(v) => {
            editor.setParagraphList(ids, kind === v ? null : v);
          }}
        />
        <div className="du-sel-align-rows-row">
          <button
            type="button"
            className="du-sel-icon-button"
            title="Decrease indent"
            aria-label="Decrease indent"
            onClick={() => {
              editor.indentParagraphs(ids, -1);
            }}
          >
            <IndentDecrease {...CONTROL_ICON} aria-hidden />
          </button>
          <button
            type="button"
            className="du-sel-icon-button"
            title="Increase indent"
            aria-label="Increase indent"
            onClick={() => {
              editor.indentParagraphs(ids, 1);
            }}
          >
            <IndentIncrease {...CONTROL_ICON} aria-hidden />
          </button>
        </div>
      </div>
    </Popover>
  );
};

/**
 * Marker-style text highlight (background behind glyphs). During inline
 * editing with a selected range the highlight lands on just those
 * characters (styled runs); otherwise on the whole element(s). Picking
 * "no color" clears the highlight.
 */
const HighlightControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const runRange = useTextRunRange(shapes);
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const value = sharedString(shapes, (s) => (s.style as TextStyle).highlight);
  return (
    <Popover
      ariaLabel="Highlight color"
      trigger={
        <button
          type="button"
          className="du-sel-icon-button"
          title="Highlight color"
          aria-label="Highlight color"
        >
          <Highlighter {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Highlight</header>
        <ColorSwatchPicker
          value={value}
          onChange={(v) => {
            const partial = { highlight: v ?? "transparent" };
            if (runRange) {
              editor.applyTextStyleToRange(runRange.target.id, runRange.from, runRange.to, partial);
            } else {
              editor.updateTextStyle(ids, partial);
            }
          }}
          onEyedrop={(cb) => {
            editor.beginEyedropperPick(cb);
          }}
        />
      </div>
    </Popover>
  );
};

const FillControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some(hasFill)) return null;
  const value = sharedString(shapes, (s) => s.style.fill);
  const ids = shapes.map((s) => s.id);
  return (
    <ColorTrigger
      label="Fill"
      ariaLabel="Fill color"
      color={value}
      onChange={(v) => {
        editor.updateStyle(ids, { fill: v ?? "transparent" });
      }}
      onEyedrop={(cb) => {
        editor.beginEyedropperPick(cb);
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Text controls — rendered only for a text-only selection (see the
// dispatcher in `PropertyPanel`). `fontSize` / `fontFamily` are
// top-level `TextElement` fields written via `editor.updateTextProps`;
// `textAlign` / `textBaseline` are `TextStyle` fields written via
// `editor.updateStyle`.
// ---------------------------------------------------------------------------

const FontSizeControl = ({
  shapes,
  allowAuto,
}: {
  readonly shapes: readonly ElementBase[];
  /** Offer the sticky "Auto" mode (rendered size tracks the card). */
  readonly allowAuto?: boolean;
}) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const value = sharedValue<number>(
    shapes,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cast asserts TextElement; non-text shapes lack fontSize at runtime
    (s) => (s as TextElement).fontSize ?? null,
  );
  const auto = allowAuto === true && shapes.every((s) => s.label?.autoFit === true);
  const presetValue =
    value !== null && TEXT_FONT_SIZE_PRESETS.some((p) => p.value === value) ? value : null;
  return (
    <Popover
      ariaLabel="Font size"
      trigger={
        <button
          type="button"
          className="du-sel-text-button"
          title="Font size"
          aria-label={`Font size ${auto ? "auto" : (value ?? "mixed")}`}
        >
          {auto ? "A" : value === null ? "—" : `${Math.round(value)}`}
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Font size</header>
        {allowAuto === true ? (
          <button
            type="button"
            className={`du-sel-icon-button du-sel-auto-size${auto ? " is-active" : ""}`}
            aria-pressed={auto}
            title="Auto — text size follows the sticky"
            onClick={() => {
              editor.setLabelAutoFit(ids, !auto);
            }}
          >
            Auto
          </button>
        ) : null}
        <SegmentedControl<number>
          ariaLabel="Font size preset"
          value={presetValue}
          options={TEXT_FONT_SIZE_PRESETS.map((p) => ({
            value: p.value,
            label: p.label,
            icon: <span style={{ fontSize: 11, fontWeight: 600 }}>{p.label}</span>,
          }))}
          onChange={(v) => {
            editor.updateTextProps(ids, { fontSize: v });
          }}
        />
        <Slider
          value={value}
          min={TEXT_FONT_SIZE_MIN}
          max={TEXT_FONT_SIZE_MAX}
          step={1}
          ariaLabel="Font size"
          valueLabel={value === null ? "—" : `${value}px`}
          onChange={(v) => {
            editor.updateTextProps(ids, { fontSize: v });
          }}
        />
      </div>
    </Popover>
  );
};

const FontFamilyControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const value = sharedString(shapes, (s) => (s as TextElement).fontFamily);
  const current = TEXT_FONT_STACKS.find((f) => f.value === value);
  const label = value === null ? "Mixed" : (current?.label ?? "Custom");
  return (
    <Popover
      ariaLabel="Font family"
      trigger={
        <button
          type="button"
          className="du-sel-text-button"
          title="Font family"
          aria-label={`Font family ${label}`}
          style={value ? { fontFamily: value } : undefined}
        >
          {label}
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Font family</header>
        {TEXT_FONT_STACKS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="menuitemradio"
            aria-checked={f.value === value}
            className={`du-sel-menu-row${f.value === value ? " is-active" : ""}`}
            style={{ fontFamily: f.value }}
            onClick={() => {
              editor.updateTextProps(ids, { fontFamily: f.value });
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </Popover>
  );
};

/**
 * Text alignment as a two-row dropdown block: horizontal (left / center /
 * right → `textAlign`) over vertical (top / middle / bottom →
 * `textBaseline`). One trigger keeps the toolbar row compact and matches
 * the target design's grouped alignment control.
 */
const TextAlignControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const value = sharedValue<TextAlign>(shapes, (s) => (s as TextElement).style.textAlign ?? "left");
  const valign = sharedValue<TextBaseline>(
    shapes,
    (s) => (s as TextElement).style.textBaseline ?? "top",
  );
  return (
    <Popover
      ariaLabel="Text alignment"
      trigger={
        <button
          type="button"
          className="du-sel-icon-button"
          title="Text alignment"
          aria-label="Text alignment"
        >
          {value === "right" ? (
            <AlignRight {...CONTROL_ICON} aria-hidden />
          ) : value === "center" ? (
            <AlignCenter {...CONTROL_ICON} aria-hidden />
          ) : (
            <AlignLeft {...CONTROL_ICON} aria-hidden />
          )}
        </button>
      }
    >
      <div className="du-sel-align-rows">
        <SegmentedControl<TextAlign>
          ariaLabel="Horizontal text alignment"
          value={value}
          options={[
            { value: "left", label: "Left", icon: <AlignLeft {...CONTROL_ICON} /> },
            {
              value: "center",
              label: "Center",
              icon: <AlignCenter {...CONTROL_ICON} />,
            },
            { value: "right", label: "Right", icon: <AlignRight {...CONTROL_ICON} /> },
          ]}
          onChange={(v) => {
            editor.updateTextStyle(ids, { textAlign: v });
          }}
        />
        <SegmentedControl<TextBaseline>
          ariaLabel="Vertical text alignment"
          value={valign}
          options={[
            {
              value: "top",
              label: "Top",
              icon: <AlignStartHorizontal {...CONTROL_ICON} />,
            },
            {
              value: "middle",
              label: "Middle",
              icon: <AlignCenterHorizontal {...CONTROL_ICON} />,
            },
            {
              value: "bottom",
              label: "Bottom",
              icon: <AlignEndHorizontal {...CONTROL_ICON} />,
            },
          ]}
          onChange={(v) => {
            editor.updateTextStyle(ids, { textBaseline: v });
          }}
        />
      </div>
    </Popover>
  );
};

/**
 * One decoration toggle inside {@link TextDecorationControl}'s popover.
 * MUST stay a module-level component: defining it inside its parent would
 * give it a fresh identity on every parent re-render, so React would
 * remount the `<button>` each frame. During inline text editing the panel
 * re-renders constantly (caret blink), and a remount between `mousedown`
 * and `mouseup` swallows the synthesized `click` — the toggle would then
 * silently never fire.
 */
const TextStyleToggle = ({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={`du-sel-icon-button${active ? " is-active" : ""}`}
    title={label}
    aria-label={label}
    aria-pressed={active}
    onClick={onClick}
  >
    {icon}
  </button>
);

/**
 * Bold / Italic / Underline / Strikethrough. One trigger (Aa) opens a
 * popover with four independent toggles. Each writes through
 * `editor.updateStyle`: bold→`fontWeight`, italic→`fontStyle`,
 * underline/strikethrough→merged `textDecoration`. Active = every
 * selected shape already has that decoration on.
 */
const TextDecorationControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const runRange = useTextRunRange(shapes);
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);

  // Active state: over an in-edit range, read the effective per-run style
  // (run overlay ?? element style); otherwise read the whole-element style.
  const rangeSegs = runRange ? sliceRuns(runRange.target, runRange.from, runRange.to) : [];
  const base = runRange?.target.style;
  const segEvery = (pred: (st: Partial<TextStyle> | undefined) => boolean): boolean =>
    rangeSegs.length > 0 && rangeSegs.every((r) => pred(r.style));
  const allBold = runRange
    ? segEvery((st) => (st?.fontWeight ?? base?.fontWeight) === "bold")
    : shapes.every((s) => (s.style as TextStyle | undefined)?.fontWeight === "bold");
  const allItalic = runRange
    ? segEvery((st) => (st?.fontStyle ?? base?.fontStyle) === "italic")
    : shapes.every((s) => (s.style as TextStyle | undefined)?.fontStyle === "italic");
  const allUnderline = runRange
    ? segEvery((st) => (st?.textDecoration ?? base?.textDecoration)?.underline === true)
    : shapes.every((s) => (s.style as TextStyle | undefined)?.textDecoration?.underline === true);
  const allStrike = runRange
    ? segEvery((st) => (st?.textDecoration ?? base?.textDecoration)?.strikethrough === true)
    : shapes.every(
        (s) => (s.style as TextStyle | undefined)?.textDecoration?.strikethrough === true,
      );

  // Apply a partial text style to the in-edit range (rich text) or, with no
  // active range, to the whole selected element(s).
  const applyPartial = (partial: Partial<TextStyle>): void => {
    if (runRange) {
      editor.applyTextStyleToRange(runRange.target.id, runRange.from, runRange.to, partial);
    } else {
      editor.updateTextStyle(ids, partial);
    }
  };
  // Toggling underline/strikethrough must preserve the other flag. Range mode
  // replaces the whole `textDecoration`, so rebuild both flags from the
  // range's current state; whole-element mode merges per shape.
  const setDecoration = (key: "underline" | "strikethrough", on: boolean): void => {
    if (runRange) {
      editor.applyTextStyleToRange(runRange.target.id, runRange.from, runRange.to, {
        textDecoration: { underline: allUnderline, strikethrough: allStrike, [key]: on },
      });
    } else {
      for (const s of shapes) {
        const cur = (s.style as TextStyle | undefined)?.textDecoration ?? {};
        editor.updateTextStyle([s.id], { textDecoration: { ...cur, [key]: on } });
      }
    }
  };
  return (
    <Popover
      ariaLabel="Text style"
      trigger={
        <button
          type="button"
          className="du-sel-icon-button"
          title="Text style (bold / italic / …)"
          aria-label="Text style"
        >
          <CaseSensitive {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Style</header>
        <div style={{ display: "flex", gap: 2 }}>
          <TextStyleToggle
            active={allBold}
            label="Bold"
            icon={<Bold {...CONTROL_ICON} />}
            onClick={() => {
              applyPartial({ fontWeight: allBold ? "normal" : "bold" });
            }}
          />
          <TextStyleToggle
            active={allItalic}
            label="Italic"
            icon={<Italic {...CONTROL_ICON} />}
            onClick={() => {
              applyPartial({ fontStyle: allItalic ? "normal" : "italic" });
            }}
          />
          <TextStyleToggle
            active={allUnderline}
            label="Underline"
            icon={<Underline {...CONTROL_ICON} />}
            onClick={() => {
              setDecoration("underline", !allUnderline);
            }}
          />
          <TextStyleToggle
            active={allStrike}
            label="Strikethrough"
            icon={<Strikethrough {...CONTROL_ICON} />}
            onClick={() => {
              setDecoration("strikethrough", !allStrike);
            }}
          />
        </div>
      </div>
    </Popover>
  );
};

const StrokeControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some(hasStroke)) return null;
  const value = sharedString(shapes, (s) => s.style.stroke);
  const ids = shapes.map((s) => s.id);
  return (
    <ColorTrigger
      label="Stroke"
      ariaLabel="Stroke color"
      color={value}
      onChange={(v) => {
        editor.updateStyle(ids, { stroke: v ?? "transparent" });
      }}
      onEyedrop={(cb) => {
        editor.beginEyedropperPick(cb);
      }}
    />
  );
};

/**
 * Width control for brush strokes: a popover with a range slider driving
 * `editor.setBrushWidth`, which re-bases the baked per-point widths while
 * keeping the stroke's pressure profile. Rendered instead of
 * {@link StrokeWidthControl} when the whole selection is brush strokes.
 */
const BrushWidthControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const value = sharedValue<number>(shapes, (s) => {
    const brush = s as unknown as BrushElement;
    const base = brush.baseWidth ?? brush.points.reduce((m, p) => Math.max(m, p.width), 0);
    return base > 0 ? Math.round(base) : null;
  });
  return (
    <Popover
      ariaLabel="Brush width"
      trigger={
        <button
          type="button"
          className="du-sel-icon-button"
          title="Brush width"
          aria-label="Brush width"
        >
          <StrokeWidthIcon thickness={2.5} />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">{`Width ${value !== null ? String(value) : "mixed"}`}</header>
        <input
          type="range"
          min={BRUSH_WIDTH_MIN}
          max={BRUSH_WIDTH_MAX}
          step={1}
          value={value ?? BRUSH_WIDTH_MIN}
          onChange={(e) => {
            editor.setBrushWidth(ids, e.currentTarget.valueAsNumber);
          }}
          style={{ width: "100%" }}
          aria-label="Brush width"
        />
      </div>
    </Popover>
  );
};

/**
 * Opacity control: percentage badge button opens a popover with a
 * slider. The trigger is always rendered (even at implicit opacity 1) so
 * the user can jump to 50% without a multi-step interaction.
 */
const OpacityControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const value = sharedValue<number>(shapes, (s) => s.style.opacity ?? 1);
  const ids = shapes.map((s) => s.id);
  const percent = value === null ? null : Math.round(value * 100);
  const label = percent === null ? "—" : `${percent}%`;
  return (
    <Popover
      ariaLabel="Opacity"
      trigger={
        <button
          type="button"
          className="du-sel-text-button"
          title="Opacity"
          aria-label={`Opacity ${label}`}
        >
          {label}
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Opacity</header>
        <Slider
          value={percent}
          min={0}
          max={100}
          step={OPACITY_SLIDER_STEP}
          ariaLabel="Opacity"
          valueLabel={label}
          onChange={(v) => {
            editor.updateStyle(ids, { opacity: v / 100 });
          }}
        />
      </div>
    </Popover>
  );
};

/**
 * Convert-type control (F9): switch every selected rectangle / ellipse /
 * diamond to another of those types, preserving position, size and style.
 * Renders only when every selected shape is convertible. The active type is
 * shown as the pressed segment (or `null` for a mixed selection).
 */
/**
 * Selection-filter buckets (reference grouping): coarse type groups the
 * Filter menu offers, keyed by bucket id. `types` maps element `type`
 * strings into the bucket.
 */
const SELECTION_BUCKETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly types: readonly string[];
}[] = [
  {
    id: "shapes",
    label: "Shapes",
    icon: Square,
    types: ["rectangle", "ellipse", "polygon", "path", "block-arrow"],
  },
  { id: "sticky", label: "Sticky notes", icon: StickyNote, types: ["sticky"] },
  { id: "text", label: "Text", icon: CaseSensitive, types: ["text"] },
  { id: "image", label: "Images", icon: ImageIcon, types: ["image"] },
  { id: "frame", label: "Frames", icon: Proportions, types: ["frame"] },
  { id: "brush", label: "Drawings", icon: Spline, types: ["brush"] },
  { id: "emoji", label: "Emoji", icon: SmilePlus, types: ["emoji"] },
  { id: "other", label: "Other", icon: MoreHorizontal, types: [] },
];

const bucketIdOf = (type: string): string =>
  SELECTION_BUCKETS.find((b) => b.types.includes(type))?.id ?? "other";

/** Group a selection's shapes into type buckets (insertion-ordered). */
const selectionBuckets = (
  shapes: readonly ElementBase[],
): ReadonlyMap<string, readonly ElementBase[]> => {
  const out = new Map<string, ElementBase[]>();
  for (const shape of shapes) {
    const id = bucketIdOf(shape.type);
    const list = out.get(id);
    if (list) list.push(shape);
    else out.set(id, [shape]);
  }
  return out;
};

/**
 * Filter control for MIXED selections (reference behaviour): a popover
 * listing the selection's type buckets with counts; picking one NARROWS
 * THE ACTUAL SELECTION to that bucket's elements (the per-type toolbar
 * then takes over). Single bucket per pick — no multi-filter.
 */
const SelectionFilterControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const buckets = selectionBuckets(shapes);
  return (
    <Popover
      ariaLabel="Filter selection"
      trigger={
        <button
          type="button"
          className="du-sel-icon-button"
          title="Filter selection by type"
          aria-label="Filter selection by type"
        >
          <ListFilter {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Select only</header>
        <div className="du-sel-mask-list" role="menu" aria-label="Selection type filter">
          {[...buckets.entries()].map(([id, members]) => {
            const bucket = SELECTION_BUCKETS.find((b) => b.id === id);
            if (!bucket) return null;
            const Icon = bucket.icon;
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                className="du-sel-mask-row"
                aria-label={`Select only ${bucket.label}`}
                onClick={() => {
                  editor.setSelection(members.map((m) => m.id));
                }}
              >
                <Icon {...CONTROL_ICON} aria-hidden />
                <span>{bucket.label}</span>
                <span className="du-sel-mask-ratio">{members.length}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Popover>
  );
};

/**
 * Switch-type targets offered by {@link ConvertTypeControl}, in menu
 * order. Every listed kind converts to every other one (shape kinds ↔
 * text ↔ sticky).
 */
const CONVERT_TARGETS: readonly {
  readonly value: ConvertTarget;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { value: "rectangle", label: "Rectangle", icon: Square },
  { value: "ellipse", label: "Ellipse", icon: Circle },
  { value: "polygon", label: "Diamond", icon: Diamond },
  { value: "text", label: "Text", icon: CaseSensitive },
  { value: "sticky", label: "Sticky note", icon: StickyNote },
];

/** Kinds inside the switch-type matrix — the only ones the picker handles. */
const isConvertible = (s: ElementBase): boolean =>
  isRectangle(s) || isEllipse(s) || isPolygon(s) || isText(s) || isSticky(s);

const convertTargetOf = (s: ElementBase): ConvertTarget =>
  isRectangle(s)
    ? "rectangle"
    : isEllipse(s)
      ? "ellipse"
      : isText(s)
        ? "text"
        : isSticky(s)
          ? "sticky"
          : "polygon";

/**
 * Switch-type picker: one trigger showing the selection's current kind
 * that opens a menu of every target kind. Picking a row converts the
 * selection in place and closes the menu.
 */
const ConvertTypeControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  const [open, setOpen] = useState(false);
  if (!editor) return null;
  const value = sharedValue<ConvertTarget>(shapes, convertTargetOf);
  const current = CONVERT_TARGETS.find((t) => t.value === value);
  const TriggerIcon = current?.icon ?? Square;
  return (
    <Popover
      ariaLabel="Switch type"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className="du-sel-icon-button"
          title="Switch type"
          aria-label="Switch type"
        >
          <TriggerIcon {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Switch type</header>
        <div className="du-sel-mask-list" role="menu" aria-label="Switch type targets">
          {CONVERT_TARGETS.map((target) => {
            const Icon = target.icon;
            const active = target.value === value;
            return (
              <button
                key={target.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`du-sel-mask-row${active ? " is-active" : ""}`}
                aria-label={target.label}
                onClick={() => {
                  editor.convertSelection(target.value);
                  setOpen(false);
                }}
              >
                <Icon {...CONTROL_ICON} aria-hidden />
                <span>{target.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Popover>
  );
};

/**
 * Mask presets offered by {@link MaskControl}: `null` = no mask, plus
 * the two parametric kinds and the built-in polygon rings. `radius`
 * default for round-rect comes from `IMAGE_MASK_DEFAULT_RADIUS`.
 */
const MASK_TILES: readonly {
  readonly key: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly mask: ImageMask | null;
}[] = [
  { key: "none", label: "No mask", icon: Square, mask: null },
  { key: "ellipse", label: "Ellipse mask", icon: Circle, mask: { kind: "ellipse" } },
  {
    key: "round-rect",
    label: "Rounded mask",
    icon: Squircle,
    mask: { kind: "round-rect", radius: IMAGE_MASK_DEFAULT_RADIUS },
  },
  ...(
    [
      ["diamond", "Diamond mask", Diamond],
      ["triangle", "Triangle mask", TriangleIcon],
      ["hexagon", "Hexagon mask", HexagonIcon],
      ["star", "Star mask", StarIcon],
    ] as const
  ).map(([key, label, icon]) => ({
    key,
    label,
    icon,
    mask: {
      kind: "polygon" as const,
      points: IMAGE_MASK_POLYGON_PRESETS[key] ?? [],
    },
  })),
];

/**
 * Aspect-preset tiles (reference mask list): momentary actions, not
 * stored kinds — Custom enters the free-crop mode, Original resets
 * crop + mask to the source's natural aspect, the rest centre-crop to
 * the ratio via `Editor.setImageAspectPreset` (Circle also installs an
 * ellipse mask on the square box).
 */
const ASPECT_TILES: readonly {
  readonly key: ImageAspectPreset | "custom";
  readonly label: string;
  readonly icon: LucideIcon;
  /** Crop ratio hint shown right-aligned in the row (w:h). */
  readonly ratio?: string;
}[] = [
  { key: "custom", label: "Custom", icon: Crop },
  { key: "original", label: "Original", icon: ImageIcon },
  { key: "circle", label: "Circle", icon: Circle },
  { key: "square", label: "Square", icon: Square },
  { key: "portrait", label: "Portrait", icon: RectangleVertical, ratio: "3:4" },
  { key: "landscape", label: "Landscape", icon: RectangleHorizontal, ratio: "4:3" },
  { key: "wide", label: "Wide", icon: Tv, ratio: "16:9" },
];

/** The tile a shape's current mask corresponds to (for the pressed state). */
const maskTileKey = (mask: ImageMask | undefined): string => {
  if (!mask) return "none";
  if (mask.kind === "polygon") {
    for (const [name, ring] of Object.entries(IMAGE_MASK_POLYGON_PRESETS)) {
      if (
        ring.length === mask.points.length &&
        ring.every((p, i) => {
          const q = mask.points[i];
          return q?.x === p.x && q.y === p.y;
        })
      ) {
        return name;
      }
    }
    return "polygon";
  }
  return mask.kind;
};

/**
 * Shape-mask picker for image selections: a popover of shape tiles
 * (None / Ellipse / Rounded / polygon presets) applied instantly, plus a
 * corner-radius slider when the rounded mask is active. The canvas
 * renderer clips through `RenderTarget.clip`, so the mask reaches every
 * backend and PNG / SVG exports.
 */
const MaskControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const images = shapes.filter((s) => isImage(s));
  if (images.length === 0) return null;
  const ids = images.map((s) => s.id);
  const current = sharedValue<string>(images, (s) => maskTileKey((s as { mask?: ImageMask }).mask));
  const firstMask = (images[0] as { mask?: ImageMask } | undefined)?.mask;
  const radius = firstMask?.kind === "round-rect" ? firstMask.radius : null;
  return (
    <Popover
      ariaLabel="Image mask"
      trigger={
        <button type="button" className="du-sel-icon-button" title="Mask" aria-label="Image mask">
          <Squircle {...CONTROL_ICON} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Mask</header>
        <div className="du-sel-mask-list" role="menu" aria-label="Aspect presets">
          {ASPECT_TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.key}
                type="button"
                role="menuitem"
                className="du-sel-mask-row"
                aria-label={tile.label}
                onClick={() => {
                  if (tile.key === "custom") {
                    const first = ids[0];
                    if (first !== undefined) editor.beginImageCrop(first);
                  } else {
                    editor.setImageAspectPreset(ids, tile.key);
                  }
                }}
              >
                <Icon {...CONTROL_ICON} aria-hidden />
                <span>{tile.label}</span>
                {tile.ratio !== undefined ? (
                  <span className="du-sel-mask-ratio">{tile.ratio}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="du-sel-mask-tiles">
          {MASK_TILES.map((tile) => {
            const Icon = tile.icon;
            const active = current === tile.key;
            return (
              <button
                key={tile.key}
                type="button"
                className={`du-sel-icon-button${active ? " is-active" : ""}`}
                title={tile.label}
                aria-label={tile.label}
                aria-pressed={active}
                onClick={() => {
                  editor.setImageMask(ids, tile.mask);
                }}
              >
                <Icon {...CONTROL_ICON} aria-hidden />
              </button>
            );
          })}
        </div>
        {radius !== null ? (
          <Slider
            value={Math.round(radius * 100)}
            min={0}
            max={IMAGE_MASK_RADIUS_MAX_PCT}
            step={IMAGE_MASK_RADIUS_STEP_PCT}
            ariaLabel="Corner radius"
            valueLabel={`${String(Math.round(radius * 100))}%`}
            onChange={(v) => {
              editor.setImageMask(ids, { kind: "round-rect", radius: v / 100 });
            }}
          />
        ) : null}
      </div>
    </Popover>
  );
};

/**
 * Crop control (F10): a button that enters image-crop mode for the single
 * selected image. Renders only for a lone image selection (crop is
 * single-target). Double-clicking the image on the canvas does the same.
 */
const CropControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const only = shapes.length === 1 ? shapes[0] : undefined;
  if (only === undefined || !isImage(only)) return null;
  const id = only.id;
  return (
    <button
      type="button"
      className="du-sel-icon-button"
      title="Crop image (double-click)"
      aria-label="Crop image"
      onClick={() => {
        editor.beginImageCrop(id);
      }}
    >
      <Crop {...CONTROL_ICON} aria-hidden />
    </button>
  );
};

// ---------------------------------------------------------------------------
// Link controls — horizontal compact set used when an edge (not a
// shape) is the active selection. Mirrors the shape control surface
// (color triggers + segmented row controls) so the floating panel
// reads consistently regardless of selection type.
// ---------------------------------------------------------------------------

const LinkStrokeColorControl = ({ edge }: { readonly edge: Link }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const color = typeof edge.style.stroke === "string" ? edge.style.stroke : null;
  return (
    <ColorTrigger
      label="Stroke"
      ariaLabel="Link stroke color"
      color={color}
      onChange={(v) => {
        editor.updateSelectedLink((e) => ({
          ...e,
          style: { ...e.style, stroke: v ?? "transparent" },
        }));
      }}
      onEyedrop={(cb) => {
        editor.beginEyedropperPick(cb);
      }}
    />
  );
};

const LinkStrokeWidthControl = ({ edge }: { readonly edge: Link }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const value = typeof edge.style.strokeWidth === "number" ? edge.style.strokeWidth : null;
  return (
    <SegmentedControl<number>
      ariaLabel="Link stroke width"
      value={value}
      options={[
        ...STROKE_WIDTH_PRESETS.map((p, i) => ({
          ...p,
          icon: <StrokeWidthIcon thickness={STROKE_WIDTH_PRESET_ICON_THICKNESS[i] ?? p.value} />,
        })),
      ]}
      onChange={(v) => {
        editor.updateSelectedLink((e) => ({
          ...e,
          style: { ...e.style, strokeWidth: v },
        }));
      }}
    />
  );
};

const LinkStrokeStyleControl = ({ edge }: { readonly edge: Link }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const da = edge.style.dashArray;
  const value: "solid" | "dashed" | "dotted" = (() => {
    if (!da || da.length === 0) return "solid";
    const first = da[0] ?? 0;
    return first <= DOTTED_DASH_MAX_SEGMENT ? "dotted" : "dashed";
  })();
  return (
    <SegmentedControl<"solid" | "dashed" | "dotted">
      ariaLabel="Link stroke style"
      value={value}
      options={[
        { value: "solid", label: "Solid", icon: <Square {...CONTROL_ICON} /> },
        { value: "dashed", label: "Dashed", icon: <SquareDashed {...CONTROL_ICON} /> },
        { value: "dotted", label: "Dotted", icon: <SquareDot {...CONTROL_ICON} /> },
      ]}
      onChange={(v) => {
        const dashArray =
          v === "solid"
            ? []
            : v === "dashed"
              ? [...STROKE_DASH_PRESETS.dashed]
              : [...STROKE_DASH_PRESETS.dotted];
        editor.updateSelectedLink((e) => ({
          ...e,
          style: { ...e.style, dashArray },
        }));
      }}
    />
  );
};

const LinkLineKindControl = ({ edge }: { readonly edge: Link }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const value: "line" | "block-arrow" = edge.lineKind ?? "line";
  return (
    <SegmentedControl<"line" | "block-arrow">
      ariaLabel="Link body"
      value={value}
      options={[
        { value: "line", label: "Line", icon: <Minus {...CONTROL_ICON} /> },
        {
          value: "block-arrow",
          label: "Block arrow",
          icon: <MoveRight {...CONTROL_ICON} />,
        },
      ]}
      onChange={(v) => {
        editor.updateSelectedLink((e) => ({ ...e, lineKind: v }));
      }}
    />
  );
};

const LinkRoutingControl = ({ edge }: { readonly edge: Link }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const value: LinkRouting = edge.routing ?? "straight";
  return (
    <SegmentedControl<LinkRouting>
      ariaLabel="Link routing"
      value={value}
      options={[
        { value: "straight", label: "Straight", icon: <RoutingIcon kind="straight" /> },
        { value: "orthogonal", label: "Elbow", icon: <RoutingIcon kind="orthogonal" /> },
        { value: "bezier", label: "Curved", icon: <Spline {...CONTROL_ICON} /> },
      ]}
      onChange={(v) => {
        editor.updateSelectedLink((e) => ({ ...e, routing: v }));
      }}
    />
  );
};

const LinkArrowheadControl = ({
  edge,
  side,
}: {
  readonly edge: Link;
  readonly side: "from" | "to";
}) => {
  const editor = useDiagramOptional();
  const [showErd, setShowErd] = useState(false);
  if (!editor) return null;
  const current: ArrowheadStyle = edge.arrowheads?.[side] ?? "none";
  const pick = (style: ArrowheadStyle) => {
    editor.updateSelectedLink((e) => ({
      ...e,
      arrowheads: { ...(e.arrowheads ?? {}), [side]: style },
    }));
  };
  const Option = ({ style }: { readonly style: ArrowheadStyle }) => (
    <button
      type="button"
      className={`du-arrowhead-option${style === current ? " du-arrowhead-option--active" : ""}`}
      title={ARROWHEAD_LABELS[style]}
      aria-label={ARROWHEAD_LABELS[style]}
      aria-pressed={style === current}
      onClick={() => {
        pick(style);
      }}
    >
      {style === "none" ? (
        <span className="du-arrowhead-none">∅</span>
      ) : arrowheadGlyphFamily(style) === "none" ? (
        <span className="du-arrowhead-erd-label">
          {ARROWHEAD_LABELS[style].replace(/^ERD /, "")}
        </span>
      ) : (
        <ArrowheadGlyph kind={style} side={side} />
      )}
    </button>
  );
  return (
    <Popover
      trigger={
        <button
          type="button"
          className="du-sel-icon-button"
          title={`Arrow ${side}: ${ARROWHEAD_LABELS[current]}`}
          aria-label={`Arrow ${side}`}
        >
          <ArrowheadGlyph kind={current} side={side} />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Arrow {side}</header>
        <div className="du-arrowhead-grid">
          {BASIC_ARROWHEADS.map((s) => (
            <Option key={s} style={s} />
          ))}
        </div>
        <button
          type="button"
          className="du-arrowhead-erd-toggle"
          aria-expanded={showErd}
          onClick={() => {
            setShowErd((v) => !v);
          }}
        >
          {showErd ? "▾" : "▸"} ER diagram
        </button>
        {showErd && (
          <div className="du-arrowhead-grid">
            {ERD_ARROWHEADS.map((s) => (
              <Option key={s} style={s} />
            ))}
          </div>
        )}
      </div>
    </Popover>
  );
};

const LinkAutoRouteControl = ({ edge }: { readonly edge: Link }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  // Obstacle-avoidance produces an orthogonal path, so it only makes sense
  // for straight / elbow links — a curved (bezier) link can't carry the
  // routed polyline. Hide the toggle for curved.
  const routing: LinkRouting = edge.routing ?? "straight";
  if (routing === "bezier") return null;
  const on = edge.avoidObstacles === true;
  return (
    <button
      type="button"
      className={`du-sel-icon-button${on ? " is-active" : ""}`}
      title="Route around shapes"
      aria-label="Route around shapes"
      aria-pressed={on}
      onClick={() => {
        editor.setSelectedLinkAvoidObstacles(!on);
      }}
    >
      <Waypoints {...CONTROL_ICON} aria-hidden />
    </button>
  );
};

const LinkDeleteControl = () => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  return (
    <button
      type="button"
      className="du-sel-icon-button"
      title="Delete edge"
      aria-label="Delete edge"
      onClick={() => {
        editor.deleteSelected();
      }}
    >
      <Trash2 {...CONTROL_ICON} aria-hidden />
    </button>
  );
};

// Inline SVG glyph for routing variant — Lucide has `Spline` for the
// curve but no clean "straight" / "elbow" line variants.
const RoutingIcon = ({ kind }: { readonly kind: "straight" | "orthogonal" }) => {
  if (kind === "straight") {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
        <line
          x1={2}
          y1={11}
          x2={12}
          y2={3}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  // orthogonal (elbow)
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M 2 11 L 2 7 L 12 7 L 12 3"
        stroke="currentColor"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// Which compact glyph family renders a given arrowhead style.
const arrowheadGlyphFamily = (
  kind: ArrowheadStyle,
): "open" | "triangle" | "diamond" | "circle" | "none" => {
  switch (kind) {
    case "arrow":
    case "openArrow":
    case "roundedArrow":
    case "arcArrow":
      return "open";
    case "triangle":
    case "filledArrow":
      return "triangle";
    case "diamond":
    case "rhombus":
    case "filledRhombus":
      return "diamond";
    case "circle":
    case "filledCircle":
      return "circle";
    default:
      return "none"; // none + ERD caps (labelled by name in the picker)
  }
};

// Picker option sets. ERD caps are gated behind a toggle.
const BASIC_ARROWHEADS: readonly ArrowheadStyle[] = [
  "none",
  "arrow",
  "openArrow",
  "roundedArrow",
  "arcArrow",
  "filledArrow",
  "triangle",
  "circle",
  "filledCircle",
  "rhombus",
  "filledRhombus",
];
const ERD_ARROWHEADS: readonly ArrowheadStyle[] = [
  "erdOne",
  "erdOnlyOne",
  "erdMany",
  "erdOneOrMany",
  "erdZeroOrOne",
  "erdZeroOrMany",
];
const ARROWHEAD_LABELS: Record<ArrowheadStyle, string> = {
  none: "None",
  arrow: "Arrow",
  openArrow: "Open arrow",
  roundedArrow: "Rounded arrow",
  arcArrow: "Arc arrow",
  triangle: "Triangle",
  filledArrow: "Filled arrow",
  circle: "Circle",
  filledCircle: "Filled circle",
  diamond: "Diamond",
  rhombus: "Rhombus",
  filledRhombus: "Filled rhombus",
  erdOne: "ERD one",
  erdOnlyOne: "ERD only one",
  erdMany: "ERD many",
  erdOneOrMany: "ERD one or many",
  erdZeroOrOne: "ERD zero or one",
  erdZeroOrMany: "ERD zero or many",
};

const ArrowheadGlyph = ({
  kind,
  side,
}: {
  readonly kind: ArrowheadStyle;
  readonly side: "from" | "to";
}) => {
  // Build a 14×14 horizontal line with the head at right (for `to`) or
  // left (for `from`), all in stroke / fill currentColor.
  const flipped = side === "from";
  const lineX1 = flipped ? 12 : 2;
  const lineX2 = flipped ? 5 : 9;
  const headCx = flipped ? 3 : 11;
  const headBase = flipped ? 5 : 9;
  const stroke = (
    <line
      x1={lineX1}
      y1={7}
      x2={lineX2}
      y2={7}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  );
  // Map the full vocabulary onto the four drawable glyph families. ERD caps
  // have no compact glyph — they fall through to a bare line; the picker
  // labels them by name so they stay distinguishable.
  const fam = arrowheadGlyphFamily(kind);
  let head: ReactNode = null;
  if (fam === "open") {
    head = (
      <polyline
        points={
          flipped
            ? `${headCx + 3},4 ${headCx},7 ${headCx + 3},10`
            : `${headCx - 3},4 ${headCx},7 ${headCx - 3},10`
        }
        stroke="currentColor"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  } else if (fam === "triangle") {
    head = (
      <polygon
        points={
          flipped
            ? `${headCx},7 ${headBase},4 ${headBase},10`
            : `${headCx},7 ${headBase},4 ${headBase},10`
        }
        fill="currentColor"
      />
    );
  } else if (fam === "diamond") {
    head = (
      <polygon
        points={`${headCx},4 ${headCx + (flipped ? -3 : 3)},7 ${headCx},10 ${headCx + (flipped ? 3 : -3)},7`}
        fill={kind === "filledRhombus" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.2}
      />
    );
  } else if (fam === "circle") {
    head = (
      <circle
        cx={headCx}
        cy={7}
        r={2.2}
        fill={kind === "filledCircle" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.2}
      />
    );
  }
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
      {stroke}
      {head}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

const Divider = () => <span className="du-sel-divider" aria-hidden />;

/**
 * Pseudo-shape exposing a shape's LABEL as if it were a text element, so
 * the text controls read label values. A shape without a label yet shows
 * the defaults its first text will take (`seedLabel` in the editor).
 */
const labelView = (s: ElementBase): ElementBase =>
  ({
    ...s,
    style: s.label?.style ?? {},
    fontSize: s.label?.fontSize ?? LABEL_DEFAULT_FONT_SIZE,
    fontFamily: s.label?.fontFamily ?? TEXT_DEFAULT_FONT_FAMILY,
    text: s.label?.text ?? "",
    runs: s.label?.runs,
  }) as unknown as ElementBase;

/**
 * Split the control list on `<Divider />` markers into `.du-sel-group`
 * clusters. The separators themselves are CSS: a group draws one before
 * itself only when a NON-EMPTY group precedes it, so an optional cluster
 * whose controls all render `null` for this selection (no label text, no
 * crop, …) never leaves a stray or doubled divider.
 */
const groupControls = (nodes: readonly ReactNode[]): ReactNode[] => {
  const groups: ReactNode[][] = [[]];
  for (const node of nodes) {
    if (isValidElement(node) && node.type === Divider) groups.push([]);
    else groups[groups.length - 1]?.push(node);
  }
  return groups
    .filter((g) => g.length > 0)
    .map((g, i) => (
      <span key={`g-${String(i)}`} className="du-sel-group">
        {g}
      </span>
    ));
};

// ---------------------------------------------------------------------------
// Inline SVG glyphs
// ---------------------------------------------------------------------------

const StrokeWidthIcon = ({ thickness }: { readonly thickness: number }) => (
  <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
    <line
      x1={2}
      y1={7}
      x2={12}
      y2={7}
      stroke="currentColor"
      strokeWidth={thickness}
      strokeLinecap="round"
    />
  </svg>
);

const CornerIcon = ({ kind }: { readonly kind: Roundness["type"] }) => {
  if (kind === "sharp") {
    return <Square {...CONTROL_ICON} aria-hidden />;
  }
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x={2}
        y={2}
        width={10}
        height={10}
        rx={3}
        ry={3}
        stroke="currentColor"
        strokeWidth={1.5}
      />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sharedValue = <T,>(
  elements: readonly ElementBase[],
  pick: (s: ElementBase) => T | null | undefined,
): T | null => {
  const set = new Set<T | null | undefined>();
  for (const s of elements) set.add(pick(s));
  if (set.size !== 1) return null;
  const v = set.values().next().value;
  return v ?? null;
};

const sharedString = (
  elements: readonly ElementBase[],
  pick: (s: ElementBase) => unknown,
): string | null => {
  const value = sharedValue<unknown>(elements, (s) => pick(s));
  return typeof value === "string" ? value : null;
};

// Frames are always fillable (white by default) even when `style.fill` is
// unset.
const hasFill = (shape: ElementBase): boolean => shape.style.fill !== undefined || isFrame(shape);
const hasStroke = (shape: ElementBase): boolean => shape.style.stroke !== undefined;
