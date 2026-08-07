import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  type Placement,
  type Strategy,
  type VirtualElement,
} from "@floating-ui/dom";

/** Positioning options for {@link floatPanel}. */
export interface FloatPanelOptions {
  /** Preferred side / alignment; `flip` tries the fallbacks when it overflows. */
  readonly placement: Placement;
  /** Gap between anchor and panel along the main axis (px). */
  readonly gap?: number;
  /** Shift along the cross axis from the aligned edge (px). */
  readonly crossAxis?: number;
  /** Minimum distance kept from every viewport edge (px). */
  readonly padding: number;
  /** Placements `flip` may fall back to; default: the opposite side. */
  readonly fallbackPlacements?: readonly Placement[];
  /** `absolute` (inside a positioned container) or `fixed` (viewport). Default `absolute`. */
  readonly strategy?: Strategy;
  /**
   * Cap the panel's height to the window height minus `padding` on both
   * sides and let it scroll — for menus that can be taller than a small
   * window. The cap is the WHOLE window, not the space on one side of the
   * anchor: a panel that fits somewhere is shifted there intact, and it
   * only scrolls when no placement can hold it at full height.
   */
  readonly clampHeight?: boolean;
}

/**
 * Keep `floating` positioned next to `reference` (a DOM element or a
 * virtual point) so it never leaves the viewport: `flip` to the other
 * side when the preferred side has no room, `shift` along the edge to
 * stay `padding` px inside, and optionally clamp the height with a
 * scrollbar. Re-runs on scroll / resize / anchor movement until the
 * returned cleanup is called. The single positioning routine behind
 * popovers, the context menu and its submenus.
 */
export const floatPanel = (
  reference: Element | VirtualElement,
  floating: HTMLElement,
  opts: FloatPanelOptions,
): (() => void) => {
  const update = () => {
    if (opts.clampHeight) {
      // Applied BEFORE measuring so flip / shift see the capped size.
      const cap = document.documentElement.clientHeight - 2 * opts.padding;
      floating.style.maxHeight = `${String(Math.max(0, Math.floor(cap)))}px`;
      floating.style.overflowY = "auto";
    }
    void computePosition(reference, floating, {
      placement: opts.placement,
      strategy: opts.strategy ?? "absolute",
      middleware: [
        offset({ mainAxis: opts.gap ?? 0, crossAxis: opts.crossAxis ?? 0 }),
        flip(
          opts.fallbackPlacements
            ? { fallbackPlacements: [...opts.fallbackPlacements] }
            : undefined,
        ),
        shift({ padding: opts.padding }),
      ],
    }).then(({ x, y }) => {
      floating.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px)`;
    });
  };
  update();
  return autoUpdate(reference, floating, update);
};
