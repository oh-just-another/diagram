import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  Bold,
  CaseSensitive,
  ChevronsDown,
  ChevronsUp,
  Copy as CopyIcon,
  FlipHorizontal2 as FlipHorizontalIcon,
  FlipVertical2 as FlipVerticalIcon,
  Group as GroupIcon,
  Italic,
  Link as LinkIcon,
  Minus,
  MoreHorizontal,
  MoreVertical,
  MoveDown,
  MoveRight,
  MoveUp,
  Spline,
  Square,
  SquareDashed,
  SquareDot,
  Strikethrough,
  Trash2,
  Underline,
  Ungroup as UngroupIcon,
  Waypoints,
} from "lucide-react";
import {
  isGroup,
  isText,
  isImage,
  isFrame,
  isRectangle,
  type ArrowheadStyle,
  type Link,
  type LinkRouting,
  type Roundness,
  type ElementBase,
  type TextAlign,
  type TextElement,
  type TextStyle,
} from "@oh-just-another/scene";
import { useDiagramOptional, useScene, useSelectedLink, useSelection } from "./hooks.js";
import { useContextMenuController } from "./context-menu-controller.js";
import { ColorSwatchPicker } from "./color-swatch-picker.js";
import { Popover } from "./popover.js";
import { SegmentedControl } from "./segmented-control.js";
import { Slider } from "./slider.js";
import {
  TEXT_FONT_SIZE_MAX,
  TEXT_FONT_SIZE_MIN,
  TEXT_FONT_SIZE_PRESETS,
  TEXT_FONT_STACKS,
} from "./constants.js";

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

  // Dispatcher: edge wins only when no shape is selected — if both
  // happen to be set (rare), the shape panel is more useful. Each branch
  // splits its controls into `primary` (always visible) and `overflow`
  // (behind the ⋮ on mobile; inline on desktop).
  if (selection.size > 0) {
    const shapes = [...selection]
      .map((id) => scene.elements.get(id))
      .filter((s): s is ElementBase => s !== undefined);
    if (shapes.length === 0) return null;
    const allText = shapes.every((s) => isText(s));
    const allImage = shapes.every((s) => isImage(s));
    const allFrame = shapes.every((s) => isFrame(s));

    const primary: ReactNode[] = [];
    const overflow: ReactNode[] = [];
    if (allFrame) {
      // A frame's border is fixed chrome (dashed outline); only its body fill
      // is user-configurable. No stroke / width / dash / roundness controls.
      primary.push(<FillControl key="fill" shapes={shapes} />);
    } else if (allText) {
      primary.push(
        <FontSizeControl key="size" shapes={shapes} />,
        <ColorOpacityControl key="color" shapes={shapes} />,
        <TextAlignControl key="align" shapes={shapes} />,
      );
      overflow.push(
        <FontFamilyControl key="family" shapes={shapes} />,
        <TextDecorationControl key="decor" shapes={shapes} />,
      );
    } else if (allImage) {
      // An image's pixels are the content — fill/stroke make no sense.
      primary.push(<OpacityControl key="opacity" shapes={shapes} />);
    } else {
      primary.push(
        <FillControl key="fill" shapes={shapes} />,
        <StrokeControl key="stroke" shapes={shapes} />,
        <StrokeWidthControl key="width" shapes={shapes} />,
      );
      overflow.push(
        <StrokeStyleControl key="dash" shapes={shapes} />,
        <RoundnessControl key="round" shapes={shapes} />,
        <OpacityControl key="opacity" shapes={shapes} />,
      );
    }
    // Common trailing controls for every shape type.
    overflow.push(<ZOrderControl key="z" />, <LinkControl key="link" shapes={shapes} />);
    // Alignment needs a reference box — only meaningful for 2+ shapes.
    if (shapes.length >= 2) overflow.push(<AlignControl key="align" />);
    overflow.push(<ActionsControl key="actions" shapes={shapes} />, <MoreButton key="more" />);
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
const PanelShell = ({
  mobile,
  primary,
  overflow,
  className,
  style,
}: {
  readonly mobile: boolean;
  readonly primary: readonly ReactNode[];
  readonly overflow: readonly ReactNode[];
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}) => {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
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
      <div className={`du-sel-panel ${className ?? ""}`.trim()} style={style}>
        {primary}
        {overflow.length > 0 ? <Divider /> : null}
        {overflow}
      </div>
    );
  }
  return (
    <div
      ref={panelRef}
      className={`du-sel-panel du-sel-panel-mobile ${className ?? ""}`.trim()}
      style={style}
    >
      <div className="du-sel-mobile-row">
        <div className="du-sel-mobile-primary">{primary}</div>
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
            <MoreVertical size={18} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>
      {expanded && overflow.length > 0 ? (
        <div className="du-sel-mobile-overflow">{overflow}</div>
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
          <LinkIcon size={14} strokeWidth={1.75} aria-hidden />
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
        const screenPoint = { x: rect.left, y: rect.bottom + 4 };
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
      <MoreHorizontal size={14} strokeWidth={1.75} aria-hidden />
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
}: {
  readonly label: string;
  readonly color: string | null;
  readonly onChange: (c: string | null) => void;
  readonly ariaLabel: string;
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
      <ColorSwatchPicker value={color} onChange={onChange} />
    </div>
  </Popover>
);

/**
 * Combined color & opacity control — a single swatch trigger whose
 * popover has both the palette and an opacity slider. Used for the text
 * panel in place of separate Fill + Opacity triggers. Writes `fill` and
 * `opacity` through `editor.updateStyle`.
 */
const ColorOpacityControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
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
          title="Color & opacity"
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
        <header className="du-sel-popover-label">Color</header>
        <ColorSwatchPicker
          value={color}
          onChange={(v) => {
            editor.updateStyle(ids, { fill: v ?? "transparent" });
          }}
        />
        <header className="du-sel-popover-label">Opacity</header>
        <Slider
          value={pct}
          min={0}
          max={100}
          step={5}
          ariaLabel="Opacity"
          valueLabel={pct === null ? "—" : `${pct}%`}
          onChange={(v) => {
            editor.updateStyle(ids, { opacity: v / 100 });
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

const FontSizeControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const value = sharedValue<number>(
    shapes,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cast asserts TextElement; non-text shapes lack fontSize at runtime
    (s) => (s as TextElement).fontSize ?? null,
  );
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
          aria-label={`Font size ${value ?? "mixed"}`}
        >
          {value === null ? "—" : `${Math.round(value)}`}
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Font size</header>
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

const TextAlignControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const value = sharedValue<TextAlign>(shapes, (s) => (s as TextElement).style.textAlign ?? "left");
  return (
    <SegmentedControl<TextAlign>
      ariaLabel="Text alignment"
      value={value}
      options={[
        { value: "left", label: "Left", icon: <AlignLeft size={14} strokeWidth={1.75} /> },
        { value: "center", label: "Center", icon: <AlignCenter size={14} strokeWidth={1.75} /> },
        { value: "right", label: "Right", icon: <AlignRight size={14} strokeWidth={1.75} /> },
      ]}
      onChange={(v) => {
        editor.updateStyle(ids, { textAlign: v });
      }}
    />
  );
};

/**
 * Bold / Italic / Underline / Strikethrough. One trigger (Aa) opens a
 * popover with four independent toggles. Each writes through
 * `editor.updateStyle`: bold→`fontWeight`, italic→`fontStyle`,
 * underline/strikethrough→merged `textDecoration`. Active = every
 * selected shape already has that decoration on.
 */
const TextDecorationControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const ids = shapes.map((s) => s.id);
  const allBold = shapes.every((s) => (s.style as TextStyle | undefined)?.fontWeight === "bold");
  const allItalic = shapes.every((s) => (s.style as TextStyle | undefined)?.fontStyle === "italic");
  const allUnderline = shapes.every(
    (s) => (s.style as TextStyle | undefined)?.textDecoration?.underline === true,
  );
  const allStrike = shapes.every(
    (s) => (s.style as TextStyle | undefined)?.textDecoration?.strikethrough === true,
  );
  // Toggling underline/strikethrough must preserve the other flag per
  // shape, so merge into each shape's current decoration individually.
  const setDecoration = (key: "underline" | "strikethrough", on: boolean): void => {
    for (const s of shapes) {
      const cur = (s.style as TextStyle | undefined)?.textDecoration ?? {};
      editor.updateStyle([s.id], { textDecoration: { ...cur, [key]: on } });
    }
  };
  const Toggle = ({
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
          <CaseSensitive size={16} strokeWidth={1.75} aria-hidden />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Style</header>
        <div style={{ display: "flex", gap: 2 }}>
          <Toggle
            active={allBold}
            label="Bold"
            icon={<Bold size={14} strokeWidth={1.75} />}
            onClick={() => {
              editor.updateStyle(ids, { fontWeight: allBold ? "normal" : "bold" });
            }}
          />
          <Toggle
            active={allItalic}
            label="Italic"
            icon={<Italic size={14} strokeWidth={1.75} />}
            onClick={() => {
              editor.updateStyle(ids, { fontStyle: allItalic ? "normal" : "italic" });
            }}
          />
          <Toggle
            active={allUnderline}
            label="Underline"
            icon={<Underline size={14} strokeWidth={1.75} />}
            onClick={() => {
              setDecoration("underline", !allUnderline);
            }}
          />
          <Toggle
            active={allStrike}
            label="Strikethrough"
            icon={<Strikethrough size={14} strokeWidth={1.75} />}
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
    />
  );
};

const StrokeWidthControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some((s) => s.style.stroke !== undefined)) return null;
  const value = sharedValue<number>(shapes, (s) => s.style.strokeWidth ?? null);
  const ids = shapes.map((s) => s.id);
  return (
    <SegmentedControl<number>
      ariaLabel="Stroke width"
      value={value}
      options={[
        { value: 1, label: "Thin", icon: <StrokeWidthIcon thickness={1} /> },
        { value: 2, label: "Medium", icon: <StrokeWidthIcon thickness={2.5} /> },
        { value: 4, label: "Thick", icon: <StrokeWidthIcon thickness={4} /> },
      ]}
      onChange={(v) => {
        editor.updateStyle(ids, { strokeWidth: v });
      }}
    />
  );
};

const StrokeStyleControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor || !shapes.some(hasStroke)) return null;
  // Tolerant detection: any 2-element array with first ≤ 3 → dotted;
  // anything else with first > 3 → dashed. Lets the panel recognise
  // template-authored arrays like `[6, 4]` (auto-grid frames) as
  // "dashed" instead of "mixed".
  const value = sharedValue<"solid" | "dashed" | "dotted">(shapes, (s) => {
    const da = s.style.dashArray;
    if (!da || da.length === 0) return "solid";
    const first = da[0] ?? 0;
    return first <= 3 ? "dotted" : "dashed";
  });
  const ids = shapes.map((s) => s.id);
  return (
    <SegmentedControl<"solid" | "dashed" | "dotted">
      ariaLabel="Stroke style"
      value={value}
      options={[
        { value: "solid", label: "Solid", icon: <Square size={14} strokeWidth={1.75} /> },
        { value: "dashed", label: "Dashed", icon: <SquareDashed size={14} strokeWidth={1.75} /> },
        { value: "dotted", label: "Dotted", icon: <SquareDot size={14} strokeWidth={1.75} /> },
      ]}
      onChange={(v) => {
        // An empty `dashArray: []` renders solid (Canvas2D `setLineDash([])`),
        // and an empty array is truthy in JS so the renderer's dash call still
        // goes through. Always pass an array.
        const dashArray = v === "solid" ? [] : v === "dashed" ? [8, 4] : [2, 4];
        editor.updateStyle(ids, { dashArray });
      }}
    />
  );
};

/**
 * Corner control: an icon button (sharp / round) opens a popover with
 * the round-radius slider plus an auto checkbox. Renders nothing when no
 * corner-capable shapes are selected.
 */
const RoundnessControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const supports = shapes.every((s) => isRectangle(s) || s.type === "container");
  if (!supports) return null;
  const type = sharedValue<Roundness["type"]>(shapes, (s) => s.style.roundness?.type ?? "sharp");
  const radius = sharedValue<number>(shapes, (s) => s.style.roundness?.value ?? null);
  const ids = shapes.map((s) => s.id);
  const isAuto = radius === null;
  return (
    <Popover
      ariaLabel="Corners"
      trigger={
        <button type="button" className="du-sel-icon-button" title="Corners" aria-label="Corners">
          <CornerIcon kind={type ?? "sharp"} />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Corners</header>
        <SegmentedControl<Roundness["type"]>
          ariaLabel="Corner roundness"
          value={type}
          options={[
            { value: "sharp", label: "Sharp", icon: <CornerIcon kind="sharp" /> },
            { value: "round", label: "Round", icon: <CornerIcon kind="round" /> },
          ]}
          onChange={(v) => {
            editor.updateStyle(ids, { roundness: { type: v } });
          }}
        />
        {type === "round" ? (
          <>
            <label className="du-prop-checkbox">
              <input
                type="checkbox"
                checked={isAuto}
                onChange={(ev) => {
                  if (ev.target.checked) {
                    editor.updateStyle(ids, { roundness: { type: "round" } });
                  } else {
                    editor.updateStyle(ids, {
                      roundness: { type: "round", value: radius ?? 8 },
                    });
                  }
                }}
              />
              <span>Auto radius</span>
            </label>
            {!isAuto ? (
              <Slider
                value={radius}
                min={0}
                max={64}
                step={1}
                ariaLabel="Corner radius"
                valueLabel={`${radius}px`}
                onChange={(v) => {
                  editor.updateStyle(ids, { roundness: { type: "round", value: v } });
                }}
              />
            ) : null}
          </>
        ) : null}
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
          step={5}
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

const ZOrderControl = () => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  return (
    <SegmentedControl<"back" | "backward" | "forward" | "front">
      ariaLabel="Z-order"
      value={null}
      options={[
        {
          value: "back",
          label: "Send to back",
          icon: <ChevronsDown size={14} strokeWidth={1.75} />,
        },
        {
          value: "backward",
          label: "Send backward",
          icon: <MoveDown size={14} strokeWidth={1.75} />,
        },
        { value: "forward", label: "Bring forward", icon: <MoveUp size={14} strokeWidth={1.75} /> },
        {
          value: "front",
          label: "Bring to front",
          icon: <ChevronsUp size={14} strokeWidth={1.75} />,
        },
      ]}
      onChange={(v) => {
        if (v === "back") editor.sendToBack();
        else if (v === "backward") editor.sendBackward();
        else if (v === "forward") editor.bringForward();
        else editor.bringToFront();
      }}
    />
  );
};

/**
 * Conditional Group / Ungroup visibility:
 *   - Group is meaningful only when ≥2 shapes are selected.
 *   - Ungroup is meaningful only when at least one selected shape is
 *     itself a group (`type === "group"`) — `Editor.ungroup` unwraps its
 *     children. A leaf shape with a group parent doesn't allow ungroup;
 *     the user has to click the group first (matches `computeUngroup`).
 *
 * Duplicate / Delete are always shown.
 */
type ActionId = "duplicate" | "delete" | "group" | "ungroup" | "flip-h" | "flip-v";

const ActionsControl = ({ shapes }: { readonly shapes: readonly ElementBase[] }) => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  const canGroup = shapes.length >= 2;
  const canUngroup = shapes.some((s) => isGroup(s));
  const options: { value: ActionId; label: string; icon: ReactNode }[] = [
    { value: "duplicate", label: "Duplicate", icon: <CopyIcon size={14} strokeWidth={1.75} /> },
    { value: "delete", label: "Delete", icon: <Trash2 size={14} strokeWidth={1.75} /> },
  ];
  if (canGroup) {
    options.push({
      value: "group",
      label: "Group",
      icon: <GroupIcon size={14} strokeWidth={1.75} />,
    });
  }
  if (canUngroup) {
    options.push({
      value: "ungroup",
      label: "Ungroup",
      icon: <UngroupIcon size={14} strokeWidth={1.75} />,
    });
  }
  options.push(
    {
      value: "flip-h",
      label: "Flip horizontal",
      icon: <FlipHorizontalIcon size={14} strokeWidth={1.75} />,
    },
    {
      value: "flip-v",
      label: "Flip vertical",
      icon: <FlipVerticalIcon size={14} strokeWidth={1.75} />,
    },
  );
  return (
    <SegmentedControl<ActionId>
      ariaLabel="Element actions"
      value={null}
      options={options}
      onChange={(v) => {
        if (v === "duplicate") editor.duplicateSelected();
        else if (v === "delete") editor.deleteSelected();
        else if (v === "group") editor.groupSelected();
        else if (v === "ungroup") editor.ungroup();
        else if (v === "flip-h") editor.flipSelection("horizontal");
        else editor.flipSelection("vertical");
      }}
    />
  );
};

/**
 * Align popover — a 3×2 grid of edge / centre alignments for the current
 * multi-selection. Mounted only when two or more shapes are selected (a single
 * shape has nothing to align to).
 */
type AlignEdgeId = "left" | "h-center" | "right" | "top" | "v-center" | "bottom";

const ALIGN_OPTIONS: { edge: AlignEdgeId; label: string; icon: ReactNode }[] = [
  { edge: "left", label: "Align left", icon: <AlignStartVertical size={16} strokeWidth={1.75} /> },
  {
    edge: "h-center",
    label: "Align horizontal centres",
    icon: <AlignCenterVertical size={16} strokeWidth={1.75} />,
  },
  { edge: "right", label: "Align right", icon: <AlignEndVertical size={16} strokeWidth={1.75} /> },
  { edge: "top", label: "Align top", icon: <AlignStartHorizontal size={16} strokeWidth={1.75} /> },
  {
    edge: "v-center",
    label: "Align vertical centres",
    icon: <AlignCenterHorizontal size={16} strokeWidth={1.75} />,
  },
  {
    edge: "bottom",
    label: "Align bottom",
    icon: <AlignEndHorizontal size={16} strokeWidth={1.75} />,
  },
];

const AlignControl = () => {
  const editor = useDiagramOptional();
  if (!editor) return null;
  return (
    <Popover
      ariaLabel="Align"
      trigger={
        <button type="button" className="du-sel-icon-button" title="Align" aria-label="Align">
          <AlignCenterVertical size={16} strokeWidth={1.75} />
        </button>
      }
    >
      <div className="du-sel-popover-section">
        <header className="du-sel-popover-label">Align</header>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
          {ALIGN_OPTIONS.map((o) => (
            <button
              key={o.edge}
              type="button"
              className="du-sel-icon-button"
              title={o.label}
              aria-label={o.label}
              onClick={() => {
                editor.alignSelection(o.edge);
              }}
            >
              {o.icon}
            </button>
          ))}
        </div>
      </div>
    </Popover>
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
        { value: 1, label: "Thin", icon: <StrokeWidthIcon thickness={1} /> },
        { value: 2, label: "Medium", icon: <StrokeWidthIcon thickness={2.5} /> },
        { value: 4, label: "Thick", icon: <StrokeWidthIcon thickness={4} /> },
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
    return first <= 3 ? "dotted" : "dashed";
  })();
  return (
    <SegmentedControl<"solid" | "dashed" | "dotted">
      ariaLabel="Link stroke style"
      value={value}
      options={[
        { value: "solid", label: "Solid", icon: <Square size={14} strokeWidth={1.75} /> },
        { value: "dashed", label: "Dashed", icon: <SquareDashed size={14} strokeWidth={1.75} /> },
        { value: "dotted", label: "Dotted", icon: <SquareDot size={14} strokeWidth={1.75} /> },
      ]}
      onChange={(v) => {
        const dashArray = v === "solid" ? [] : v === "dashed" ? [8, 4] : [2, 4];
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
        { value: "line", label: "Line", icon: <Minus size={14} strokeWidth={1.75} /> },
        {
          value: "block-arrow",
          label: "Block arrow",
          icon: <MoveRight size={14} strokeWidth={2.5} />,
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
        { value: "bezier", label: "Curved", icon: <Spline size={14} strokeWidth={1.75} /> },
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
      <Waypoints size={14} strokeWidth={1.75} aria-hidden />
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
      <Trash2 size={14} strokeWidth={1.75} aria-hidden />
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
    return <Square size={14} strokeWidth={1.75} aria-hidden />;
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
