import { OjaDiagramElement } from "./oja-diagram-element.js";

export { OjaDiagramElement } from "./oja-diagram-element.js";

export {
  applyOjaDiagramProps,
  bindOjaDiagramEvents,
  ojaDiagramController,
  OJA_DIAGRAM_EVENTS,
  type DiagramRenderer,
  type DiagramTheme,
  type OjaDiagramController,
  type OjaDiagramEventHandlers,
  type OjaDiagramEventMap,
  type OjaDiagramProps,
} from "./bindings.js";

/** The tag name the element registers under. */
export const OJA_DIAGRAM_TAG = "oja-diagram";

/**
 * Register `<oja-diagram>` in the custom-element registry. Idempotent —
 * safe to call repeatedly and from multiple bundles; a name already taken
 * is left untouched. Importing this module's default side effect (below)
 * registers it automatically, so most hosts never call this directly.
 */
export const defineOjaDiagram = (tag: string = OJA_DIAGRAM_TAG): void => {
  if (typeof customElements === "undefined") return;
  if (customElements.get(tag)) return;
  customElements.define(tag, OjaDiagramElement);
};

defineOjaDiagram();

declare global {
  interface HTMLElementTagNameMap {
    "oja-diagram": OjaDiagramElement;
  }
}
