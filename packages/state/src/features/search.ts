import { isText, isFrame, type Element, type Scene } from "@oh-just-another/scene";
import type { ElementId, LinkId } from "@oh-just-another/types";

/**
 * Which scene object a {@link SceneSearchMatch} points at — a shape
 * (`element`) or a connector (`link`). Determines whether a host selects
 * it via `Editor.setSelection` or `Editor.selectLink`.
 */
export type SceneSearchKind = "element" | "link";

/**
 * A single hit from {@link searchScene}: the object's kind + id and the
 * text that matched (already trimmed of nothing — verbatim source text),
 * so a UI can show the match label next to the counter.
 */
export interface SceneSearchMatch {
  readonly kind: SceneSearchKind;
  readonly id: ElementId | LinkId;
  /** The verbatim source text that contained the query. */
  readonly text: string;
}

/**
 * Searchable text carried by an element, or `null` when it has none.
 * Text shapes contribute their body; frames contribute their header name.
 * Other shape types carry no intrinsic label (their text lives in a
 * separate bound `TextElement`, which is matched on its own).
 */
export const elementSearchText = (element: Element): string | null => {
  if (isText(element)) return element.text.length > 0 ? element.text : null;
  if (isFrame(element)) {
    const name = element.name;
    return name !== undefined && name.length > 0 ? name : null;
  }
  return null;
};

/**
 * Case-insensitive substring search across all text in a scene: text
 * shapes, frame names, and edge labels. Returns matches in a stable order
 * (elements in insertion order, then links) so `N of M` navigation is
 * deterministic. An empty / whitespace-only query returns no matches.
 *
 * Pure and linear — fine to run on every keystroke for typical scenes;
 * hosts with very large scenes can debounce.
 */
export const searchScene = (scene: Scene, query: string): SceneSearchMatch[] => {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const matches: SceneSearchMatch[] = [];
  for (const element of scene.elements.values()) {
    const text = elementSearchText(element);
    if (text?.toLowerCase().includes(needle)) {
      matches.push({ kind: "element", id: element.id, text });
    }
  }
  for (const link of scene.links.values()) {
    const text = link.label?.text;
    if (text?.toLowerCase().includes(needle)) {
      matches.push({ kind: "link", id: link.id, text });
    }
  }
  return matches;
};
