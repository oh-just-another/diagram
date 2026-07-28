import {
  caretGeometry,
  layoutText,
  pointToCaretIndex,
  selectionRects as textSelectionRects,
  type EditableTextLayout,
  type RenderTarget,
} from "@oh-just-another/renderer-core";
import {
  getElement,
  getElementWorldBounds,
  isText,
  removeElement,
  remapParagraphsForTextChange,
  updateElement,
  type Element,
  type Patch,
  type Scene,
  type TextElement,
  type TextParagraph,
} from "@oh-just-another/scene";
import type { Bounds, ElementId, LayerId, Vec2 } from "@oh-just-another/types";
import { shapeLabelLayout } from "@oh-just-another/renderer-core";
import { CaretBlinkController } from "./caret-blink.js";
import { LABEL_DEFAULT_FONT_SIZE, TEXT_DEFAULT_FONT_FAMILY } from "../constants.js";
import { canBeginTextEdit } from "./public/text-edit.js";

/** Live selection inside the edited text (source offsets; `dir` is the anchored end). */
export interface TextSelection {
  start: number;
  end: number;
  dir: "forward" | "backward";
}

/**
 * Editor capabilities the inline text-edit flow needs. Keeps the controller
 * off the god-class: scene access, history, selection clearing and text
 * measurement are delegated back to the Editor through this narrow interface.
 */
export interface TextEditHost {
  /** Current scene (read + replace — live edits mutate without history). */
  scene: Scene;
  /** Record a patch as one undo step. */
  pushHistory(patch: Patch): void;
  /** Repaint + listener fan-out. */
  notify(): void;
  /** True when the layer is locked (blocks starting an edit). */
  isLayerLocked(id: LayerId): boolean;
  /** Clear the selection when it holds the removed shape. */
  clearSelectionFor(id: ElementId): void;
  /** Main render target — the SAME `measureText` source the renderer draws with. */
  readonly mainTarget: Pick<RenderTarget, "setFont" | "measureText">;
}

/**
 * Owns the inline text-edit session state (edited shape, pending creation,
 * origin snapshot, live selection, canvas drag-select anchor and caret blink).
 * Extracted from the Editor god-class; the Editor keeps thin delegate wrappers
 * so its public API is unchanged.
 */
export class TextEditController {
  /**
   * Currently edited text shape (or null). Set by `begin`; cleared by
   * `commit` / `cancel`. The host overlay (`<TextEditorOverlay>` in
   * `@react-ui`) subscribes via `editor` and renders a `<textarea>`
   * positioned over the shape.
   */
  private _editingElement: ElementId | null = null;
  /**
   * When the `draw-text` tool just placed a shape and opened its
   * editor, this holds that shape's id until the first commit. A
   * pending creation isn't in history yet: committing non-empty text
   * records a single add patch (whole shape = one undo); committing
   * empty / cancelling removes it with no history entry at all.
   */
  private _pendingCreate: ElementId | null = null;
  /**
   * Snapshot of the shape at edit start. Used to revert on cancel and
   * as the `before` of the single commit patch. `null` for a pending
   * creation (the shape didn't exist yet).
   */
  private _origin: Element | null = null;
  /**
   * Live selection inside the edited text, mirrored from the hidden
   * `<textarea>` (`start`/`end` are source offsets, `dir` is the
   * anchored end). The caret is `dir === "backward" ? start : end`.
   */
  private _sel: TextSelection | null = null;
  /** Anchor offset for a canvas drag-select inside the edited text. */
  private _dragAnchor: number | null = null;
  private readonly caretBlink: CaretBlinkController;

  constructor(private readonly host: TextEditHost) {
    this.caretBlink = new CaretBlinkController(() => {
      this.host.notify();
    });
  }

  get editingElement(): ElementId | null {
    return this._editingElement;
  }

  get selection(): TextSelection | null {
    return this._sel;
  }

  /** Caret offset = the moving end of the selection. */
  get caret(): number | null {
    if (!this._sel) return null;
    return this._sel.dir === "backward" ? this._sel.start : this._sel.end;
  }

  get caretBlinkOn(): boolean {
    return this.caretBlink.on;
  }

  /** `true` while a canvas drag-select inside the edited text is active. */
  get isDragging(): boolean {
    return this._dragAnchor !== null;
  }

  /** Mark a freshly-placed `draw-text` shape as pending until the first commit. */
  markPendingCreate(id: ElementId): void {
    this._pendingCreate = id;
  }

  /**
   * Begin editing a text shape's body. No-op when the shape doesn't
   * exist or isn't a text shape. Concurrent edits commit themselves
   * (only one shape at a time). Caret defaults to the end of the text.
   */
  begin(id: ElementId): void {
    if (!canBeginTextEdit(this.host.scene, id, (lid) => this.host.isLayerLocked(lid))) return;
    // Commit any in-flight edit on a different shape first.
    if (this._editingElement !== null && this._editingElement !== id) this.commit();
    this._editingElement = id;
    this._origin = this._pendingCreate === id ? null : (getElement(this.host.scene, id) ?? null);
    let shape = getElement(this.host.scene, id);
    // A labelable shape without a label yet gets an empty one live (no
    // history — the commit patch covers it, the origin snapshot lacks it).
    if (shape !== undefined && !isText(shape) && shape.label === undefined) {
      const r = updateElement(this.host.scene, id, (s) => ({
        ...s,
        label: {
          text: "",
          fontFamily: TEXT_DEFAULT_FONT_FAMILY,
          fontSize: LABEL_DEFAULT_FONT_SIZE,
        },
      }));
      this.host.scene = r.scene;
      shape = getElement(this.host.scene, id);
    }
    const len = shape !== undefined ? this.editedText(shape).length : 0;
    this._sel = { start: len, end: len, dir: "forward" };
    this.caretBlink.start();
    this.host.notify();
  }

  /** Flat text of the edited shape — its own for text, the label's otherwise. */
  private editedText(shape: Element): string {
    if (isText(shape)) return shape.text;
    return shape.label?.text ?? "";
  }

  /**
   * Content view of the edited shape: the element itself for text shapes,
   * the embedded label as a synthetic text element PLUS its local-space
   * offset for labelled shapes (same geometry the renderer draws with,
   * via `shapeLabelLayout` — caret and glyphs can't drift apart).
   */
  private editView(shape: Element): {
    text: TextElement;
    offX: number;
    offY: number;
    window?: { top: number; bottom: number };
  } | null {
    if (isText(shape)) return { text: shape, offX: 0, offY: 0 };
    const label = shape.label;
    if (label === undefined) return null;
    const measure = this.measureForFont(
      label.fontFamily,
      label.fontSize,
      label.style?.fontWeight,
      label.style?.fontStyle,
    );
    const placed = shapeLabelLayout(shape, measure);
    if (!placed) return null;
    return {
      text: placed.synthetic,
      offX: placed.offsetX,
      offY: placed.offsetY,
      window: { top: placed.windowTop, bottom: placed.windowBottom },
    };
  }

  /**
   * Keep the caret inside the label's visible line window by adjusting
   * the transient `metadata.labelScrollLines` on the edited shape (live,
   * no history — stripped again on commit / cancel). No-op for text
   * elements (they have no clip window).
   */
  private followLabelCaret(): void {
    const id = this._editingElement;
    if (!id || !this._sel) return;
    const shape = getElement(this.host.scene, id);
    if (!shape || isText(shape) || shape.label === undefined) return;
    const view = this.editView(shape);
    if (!view) return;
    const layout = this.editingTextLayout(view.text);
    const win = view.window;
    if (!layout || !win) return;
    const clipLines = Math.max(1, Math.round((win.bottom - win.top) / layout.lineHeight));
    const caretIdx = this._sel.dir === "backward" ? this._sel.start : this._sel.end;
    const g = caretGeometry(
      layout,
      caretIdx,
      this.measureFor(view.text),
      view.text.fontSize,
      "left",
    );
    const scroll = Math.round(win.top / layout.lineHeight);
    let next = scroll;
    if (g.line < scroll) next = g.line;
    else if (g.line >= scroll + clipLines) next = g.line - clipLines + 1;
    if (next === scroll) return;
    this.host.scene = updateElement(this.host.scene, id, (sh) => ({
      ...sh,
      metadata: { ...sh.metadata, labelScrollLines: next },
    })).scene;
  }

  /** Drop the transient label-scroll hint when the edit session ends. */
  private clearLabelScroll(id: ElementId): void {
    const shape = getElement(this.host.scene, id);
    if (shape?.metadata?.labelScrollLines === undefined) return;
    this.host.scene = updateElement(this.host.scene, id, (sh) => {
      const { labelScrollLines: _drop, ...rest } = sh.metadata ?? {};
      const copy: typeof sh = { ...sh };
      if (Object.keys(rest).length > 0) (copy as { metadata?: unknown }).metadata = rest;
      else delete (copy as { metadata?: unknown }).metadata;
      return copy;
    }).scene;
  }

  /**
   * Live edit transport from the hidden `<textarea>`: replace the
   * shape's text + selection as the user types / pastes / composes.
   * Mutates the scene WITHOUT a history entry — history is recorded
   * once on commit. No-op when not editing.
   */
  setText(
    value: string,
    selStart: number,
    selEnd: number,
    dir: "forward" | "backward" = "forward",
  ): void {
    const id = this._editingElement;
    if (!id) return;
    const r = updateElement(this.host.scene, id, (s) => {
      // Label mode: the typed text lands on the embedded label.
      if (!isText(s) && s.label !== undefined) {
        const label = { ...s.label, text: value } as typeof s.label & {
          paragraphs?: readonly TextParagraph[];
        };
        if (s.label.paragraphs !== undefined) {
          const remapped = remapParagraphsForTextChange(s.label.text, value, s.label.paragraphs);
          if (remapped !== undefined) label.paragraphs = remapped;
          else delete label.paragraphs;
        }
        return { ...s, label };
      }
      const next = { ...s, text: value } as typeof s & {
        paragraphs?: readonly TextParagraph[];
        text: string;
      };
      // Keep paragraph list attrs aligned as newlines come and go —
      // Enter inside a list item continues the list, deleting a line
      // drops its attrs.
      if (isText(s) && s.paragraphs !== undefined) {
        const remapped = remapParagraphsForTextChange(s.text, value, s.paragraphs);
        if (remapped !== undefined) next.paragraphs = remapped;
        else delete next.paragraphs;
      }
      return next;
    });
    this.host.scene = r.scene;
    this._sel = { start: selStart, end: selEnd, dir };
    this.followLabelCaret();
    this.caretBlink.wake();
    this.host.notify();
  }

  /** Selection-only update (arrows / shift-select / click) — no text change. */
  setSelection(selStart: number, selEnd: number, dir: "forward" | "backward" = "forward"): void {
    if (!this._editingElement) return;
    this._sel = { start: selStart, end: selEnd, dir };
    this.followLabelCaret();
    this.caretBlink.wake();
    this.host.notify();
  }

  /**
   * Map a world-space point to a caret offset in the edited text. Used
   * to place / extend the caret from canvas clicks. Returns `null` when
   * not editing or the shape is gone.
   */
  caretIndexAtWorldPoint(worldPoint: Vec2): number | null {
    const id = this._editingElement;
    if (!id) return null;
    const shape = getElement(this.host.scene, id);
    if (shape === undefined) return null;
    const view = this.editView(shape);
    if (!view) return null;
    const layout = this.editingTextLayout(view.text);
    if (!layout) return null;
    // World → shape-local: undo the element transform so the hit lands on the
    // right glyph. Translate by position (+ the label offset for embedded
    // labels), then divide out scale (rotation while editing text is not
    // handled — an uncommon case).
    const sx = shape.scale.x || 1;
    const sy = shape.scale.y || 1;
    const local = {
      x: (worldPoint.x - shape.position.x) / sx - view.offX,
      y: (worldPoint.y - shape.position.y) / sy - view.offY,
    };
    const align = view.text.style.textAlign ?? "left";
    return pointToCaretIndex(layout, local, this.measureFor(view.text), align);
  }

  /**
   * `true` when a point is inside the currently-edited text shape's
   * world bounds. Used by the pointer binding to decide between
   * repositioning the caret (inside) and committing (outside).
   */
  editedElementContainsPoint(worldPoint: Vec2): boolean {
    const id = this._editingElement;
    if (!id) return false;
    const shape = getElement(this.host.scene, id);
    if (!shape) return false;
    const b = getElementWorldBounds(shape);
    return (
      worldPoint.x >= b.x &&
      worldPoint.x <= b.x + b.width &&
      worldPoint.y >= b.y &&
      worldPoint.y <= b.y + b.height
    );
  }

  /** Place a collapsed caret at the clicked point and start a drag-select. */
  setCaretFromPoint(worldPoint: Vec2): void {
    const idx = this.caretIndexAtWorldPoint(worldPoint);
    if (idx === null) return;
    this._dragAnchor = idx;
    this.setSelection(idx, idx, "forward");
  }

  /** Extend the selection from the drag anchor to the current point. */
  extendSelectionToPoint(worldPoint: Vec2): void {
    if (this._dragAnchor === null) return;
    const idx = this.caretIndexAtWorldPoint(worldPoint);
    if (idx === null) return;
    const anchor = this._dragAnchor;
    if (idx >= anchor) this.setSelection(anchor, idx, "forward");
    else this.setSelection(idx, anchor, "backward");
  }

  /** End a canvas drag-select (clears the drag anchor). */
  endDragSelect(): void {
    this._dragAnchor = null;
  }

  /** Build the editable layout for a text shape using the main target's metrics. */
  private editingTextLayout(shape: TextElement): EditableTextLayout | null {
    return layoutText(shape.text, this.measureFor(shape), {
      fontSize: shape.fontSize,
      ...(shape.maxWidth !== undefined ? { maxWidth: shape.maxWidth } : {}),
      ...(shape.paragraphs !== undefined ? { paragraphs: shape.paragraphs } : {}),
    });
  }

  /**
   * A measure callback bound to a shape's font, using the main target's
   * `measureText` — the SAME source the renderer draws with (WebGL2
   * reports MSDF advances) and the bounder measures with. Caret /
   * selection geometry therefore lines up exactly with the glyphs.
   */
  private measureFor(shape: TextElement): (s: string) => number {
    return this.measureForFont(
      shape.fontFamily,
      shape.fontSize,
      shape.style.fontWeight,
      shape.style.fontStyle,
    );
  }

  private measureForFont(
    fontFamily: string,
    fontSize: number,
    weight?: string,
    style?: string,
  ): (s: string) => number {
    const target = this.host.mainTarget;
    // Match the rendered weight/style so caret / selection geometry lines
    // up with bold / italic glyphs (which have different advances).
    target.setFont(fontFamily, fontSize, {
      ...(weight === "bold" ? { weight: "bold" as const } : {}),
      ...(style === "italic" ? { style: "italic" as const } : {}),
    });
    return (s: string) => target.measureText(s).width;
  }

  /**
   * World-space caret + selection geometry for the overlay pass.
   * Returns `null` when not editing. The caret is `null` while blinked
   * off so the overlay can simply skip drawing it.
   */
  overlay(): {
    caret: { x: number; y: number; height: number } | null;
    caretColor: string;
    selectionRects: readonly Bounds[];
  } | null {
    const id = this._editingElement;
    if (!id || !this._sel) return null;
    const shape = getElement(this.host.scene, id);
    if (shape === undefined) return null;
    const view = this.editView(shape);
    if (!view) return null;
    const layout = this.editingTextLayout(view.text);
    if (!layout) return null;
    const align = view.text.style.textAlign ?? "left";
    const measure = this.measureFor(view.text);
    // The layout is in the shape's own (unscaled) space; the renderer draws it
    // through the element transform, so caret + selection geometry must scale
    // too or they trail the rendered text on a scaled element. (Rotation while
    // editing text is not handled — an uncommon case.) Embedded labels add
    // their local offset before the transform.
    const sx = shape.scale.x;
    const sy = shape.scale.y;
    const px = shape.position.x + view.offX * sx;
    const py = shape.position.y + view.offY * sy;

    // Clip highlight rects (and the caret) to the label's visible window
    // so nothing paints outside the shape body.
    const win = view.window;
    const local = textSelectionRects(layout, this._sel.start, this._sel.end, measure, align)
      .map((r) => {
        if (!win) return r;
        const top = Math.max(r.y, win.top);
        const bottom = Math.min(r.y + r.height, win.bottom);
        return { ...r, y: top, height: bottom - top };
      })
      .filter((r) => r.height > 0);
    const selectionRects: Bounds[] = local.map((r) => ({
      x: px + Math.min(r.x * sx, (r.x + r.width) * sx),
      y: py + Math.min(r.y * sy, (r.y + r.height) * sy),
      width: Math.abs(r.width * sx),
      height: Math.abs(r.height * sy),
    }));

    let caret: { x: number; y: number; height: number } | null = null;
    if (this.caretBlink.on) {
      const cIdx = this._sel.dir === "backward" ? this._sel.start : this._sel.end;
      const g = caretGeometry(layout, cIdx, measure, view.text.fontSize, align);
      const visible = !win || (g.y >= win.top && g.y < win.bottom);
      if (visible) {
        caret = { x: px + g.x * sx, y: py + g.y * sy, height: g.height * Math.abs(sy) };
      }
    }
    return { caret, caretColor: view.text.style.fill ?? "#1a1a1a", selectionRects };
  }

  commit(next?: string): void {
    const id = this._editingElement;
    if (!id) return;
    this.clearLabelScroll(id);
    const pending = this._pendingCreate === id;
    const origin = this._origin;
    // Optional explicit text (keyboard / test callers); the live path
    // passes nothing because the scene already holds the typed text.
    if (next !== undefined) {
      this.host.scene = updateElement(this.host.scene, id, (s) =>
        !isText(s) && s.label !== undefined
          ? { ...s, label: { ...s.label, text: next } }
          : { ...s, text: next },
      ).scene;
    }
    this._editingElement = null;
    this._pendingCreate = null;
    this._origin = null;
    this._sel = null;
    this.caretBlink.stop();

    const committed = getElement(this.host.scene, id);

    // Label mode commits separately: an empty label is stripped from the
    // shape (the shape itself stays), a non-empty one records a single
    // whole-element patch against the origin.
    if (committed !== undefined && !isText(committed)) {
      if ((committed.label?.text ?? "").trim() === "") {
        const r = updateElement(this.host.scene, id, (s) => {
          const copy: typeof s = { ...s };
          delete (copy as { label?: unknown }).label;
          return copy;
        });
        this.host.scene = r.scene;
        if (origin?.label !== undefined) {
          this.host.pushHistory({
            kind: "element",
            id,
            before: origin,
            after: getElement(this.host.scene, id) ?? origin,
          });
        }
      } else if (origin && origin.label?.text !== committed.label?.text) {
        this.host.pushHistory({ kind: "element", id, before: origin, after: committed });
      }
      this.host.notify();
      return;
    }

    const finalElement = committed !== undefined && isText(committed) ? committed : undefined;
    const text = finalElement?.text ?? "";

    // Empty (whitespace-only) text removes the shape. Pending = silent
    // (never recorded); existing = recorded so undo restores the origin.
    if (text.trim() === "") {
      if (finalElement) {
        this.host.scene = removeElement(this.host.scene, id).scene;
        if (!pending && origin) {
          this.host.pushHistory({ kind: "element", id, before: origin, after: null });
        }
        this.host.clearSelectionFor(id);
      }
      this.host.notify();
      return;
    }

    if (pending) {
      // Record the whole creation as one add patch.
      if (finalElement)
        this.host.pushHistory({ kind: "element", id, before: null, after: finalElement });
    } else if (origin && finalElement) {
      // Existing edit: record ONLY the text delta. Other fields (font
      // size etc.) changed via the panel push their own history during
      // the edit, so the commit's `before` keeps the final non-text
      // state and rewinds just the text.
      const originText = isText(origin) ? origin.text : "";
      if (originText !== finalElement.text) {
        const before = { ...finalElement, text: originText } as Element;
        this.host.pushHistory({ kind: "element", id, before, after: finalElement });
      }
    }
    this.host.notify();
  }

  cancel(): void {
    const id = this._editingElement;
    if (id === null) return;
    this.clearLabelScroll(id);
    const pending = this._pendingCreate === id;
    const origin = this._origin;
    this._editingElement = null;
    this._pendingCreate = null;
    this._origin = null;
    this._sel = null;
    this.caretBlink.stop();

    // Revert live edits with no history entry. Pending creations are
    // removed entirely; existing shapes have only their TEXT (or label)
    // restored (panel-driven field changes during the edit keep their own
    // committed history and must survive the cancel).
    if (pending) {
      if (getElement(this.host.scene, id)) {
        this.host.scene = removeElement(this.host.scene, id).scene;
        this.host.clearSelectionFor(id);
      }
    } else if (origin) {
      this.host.scene = updateElement(this.host.scene, id, (s) => {
        if (!isText(s)) {
          const copy: typeof s = { ...s };
          if (origin.label !== undefined) (copy as { label?: unknown }).label = origin.label;
          else delete (copy as { label?: unknown }).label;
          return copy;
        }
        return { ...s, text: isText(origin) ? origin.text : "" };
      }).scene;
    }
    this.host.notify();
  }
}
