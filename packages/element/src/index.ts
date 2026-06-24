import { OhDiagramElement } from "./oh-diagram-element.js";

export { OhDiagramElement } from "./oh-diagram-element.js";

export {
  applyOhDiagramProps,
  bindOhDiagramEvents,
  ohDiagramController,
  OH_DIAGRAM_EVENTS,
  type DiagramRenderer,
  type DiagramTheme,
  type OhDiagramController,
  type OhDiagramEventHandlers,
  type OhDiagramEventMap,
  type OhDiagramProps,
} from "./bindings.js";

/** The tag name the element registers under. */
export const OH_DIAGRAM_TAG = "oh-diagram";

/**
 * Register `<oh-diagram>` in the custom-element registry. Idempotent —
 * safe to call repeatedly and from multiple bundles; a name already taken
 * is left untouched. Importing this module's default side effect (below)
 * registers it automatically, so most hosts never call this directly.
 */
export const defineOhDiagram = (tag: string = OH_DIAGRAM_TAG): void => {
  if (typeof customElements === "undefined") return;
  if (customElements.get(tag)) return;
  customElements.define(tag, OhDiagramElement);
};

defineOhDiagram();

declare global {
  interface HTMLElementTagNameMap {
    "oh-diagram": OhDiagramElement;
  }
}
