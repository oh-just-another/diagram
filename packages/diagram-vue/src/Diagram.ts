import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
  type SlotsType,
} from "vue";
// Side effect: registers the <oja-diagram> custom element the moment this
// wrapper is imported, so the host never has to call `defineOjaDiagram`.
import "@oh-just-another/diagram";
import {
  applyOjaDiagramProps,
  bindOjaDiagramEvents,
  ojaDiagramController,
  type DiagramRenderer,
  type DiagramTheme,
  type OjaDiagramController,
  type OjaDiagramElement,
  type OjaDiagramEventMap,
} from "@oh-just-another/diagram";
import type { Scene } from "@oh-just-another/scene";

/**
 * `<Diagram>` — a thin Vue wrapper over the `<oja-diagram>` custom element.
 * Props map one-to-one to the element's configuration; the four element
 * events re-emit as Vue events (`@ready`, `@scenechange`, `@selectionchange`,
 * `@themechange`). The element is driven imperatively rather than through the
 * template so custom-element property-vs-attribute quirks never bite, and the
 * binding logic itself lives once in `@oh-just-another/diagram`.
 *
 * Imperative control (`undo`, `loadScene`, …) is reachable through a template
 * ref — the component {@link OjaDiagramController.constructor exposes} the
 * curated controller surface.
 */
export const Diagram = defineComponent({
  name: "Diagram",
  props: {
    scene: { type: Object as PropType<Scene>, default: undefined },
    theme: { type: String as PropType<DiagramTheme>, default: undefined },
    renderer: { type: String as PropType<DiagramRenderer>, default: undefined },
    grid: { type: Boolean, default: false },
    snap: { type: Boolean, default: false },
  },
  emits: {
    ready: (_payload: OjaDiagramEventMap["ready"]) => true,
    scenechange: (_scene: OjaDiagramEventMap["scenechange"]) => true,
    selectionchange: (_ids: OjaDiagramEventMap["selectionchange"]) => true,
    themechange: (_theme: OjaDiagramEventMap["themechange"]) => true,
  },
  // No default slot — the editor owns its content. Declared for typing only.
  slots: Object as SlotsType<Record<never, never>>,
  setup(props, { emit, expose }) {
    const elRef = ref<OjaDiagramElement | null>(null);
    let unbind: (() => void) | null = null;

    const sync = (): void => {
      if (elRef.value) applyOjaDiagramProps(elRef.value, props);
    };

    onMounted(() => {
      const el = elRef.value;
      if (!el) return;
      applyOjaDiagramProps(el, props);
      unbind = bindOjaDiagramEvents(el, {
        ready: (detail) => {
          emit("ready", detail);
        },
        scenechange: (detail) => {
          emit("scenechange", detail);
        },
        selectionchange: (detail) => {
          emit("selectionchange", detail);
        },
        themechange: (detail) => {
          emit("themechange", detail);
        },
      });
    });

    // One watcher over every prop — `applyOjaDiagramProps` is idempotent.
    watch(() => [props.scene, props.theme, props.renderer, props.grid, props.snap], sync);

    onBeforeUnmount(() => {
      unbind?.();
      unbind = null;
    });

    expose(ojaDiagramController(() => elRef.value) satisfies OjaDiagramController);

    return () =>
      h("oja-diagram", {
        ref: elRef,
        style: "display:block;width:100%;height:100%",
      });
  },
});

export default Diagram;
