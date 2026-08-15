import {
  canCarryLabel,
  isSticky,
  isText,
  type Element,
  type ShapeLabel,
} from "@oh-just-another/scene";
import { LABEL_DEFAULT_FONT_SIZE, TEXT_DEFAULT_FONT_FAMILY } from "../../constants.js";

/**
 * The empty label a labelable shape gets the first time text or a text
 * style is applied to it: default family / size, no text. Sticky notes
 * start in auto-fit mode (the rendered size tracks the card until an
 * explicit size is picked). Single source for the inline editor and the
 * style APIs, so both seed identical labels.
 */
export const seedLabel = (shape: Element): ShapeLabel => ({
  text: "",
  fontFamily: TEXT_DEFAULT_FONT_FAMILY,
  fontSize: LABEL_DEFAULT_FONT_SIZE,
  ...(isSticky(shape) ? { autoFit: true } : {}),
});

/** `shape` with a label guaranteed — seeded when a labelable shape has none. */
export const withLabel = (shape: Element): Element =>
  shape.label !== undefined || isText(shape) || !canCarryLabel(shape)
    ? shape
    : { ...shape, label: seedLabel(shape) };
