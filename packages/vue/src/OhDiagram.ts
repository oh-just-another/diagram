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
// Side effect: registers the <oh-diagram> custom element the moment this
// wrapper is imported, so the host never has to call `defineOhDiagram`.
import "@oh-just-another/element";
import {
  applyOhDiagramProps,
  bindOhDiagramEvents,
  ohDiagramController,
  type DiagramRenderer,
  type DiagramTheme,
  type OhDiagramController,
  type OhDiagramElement,
  type OhDiagramEventMap,
} from "@oh-just-another/element";
import type { Scene } from "@oh-just-another/scene";

/**
 * `<OhDiagram>` — a thin Vue wrapper over the `<oh-diagram>` custom element.
 * Props map one-to-one to the element's configuration; the four element
 * events re-emit as Vue events (`@ready`, `@scenechange`, `@selectionchange`,
 * `@themechange`). The element is driven imperatively rather than through the
 * template so custom-element property-vs-attribute quirks never bite, and the
 * binding logic itself lives once in `@oh-just-another/element`.
 *
 * Imperative control (`undo`, `loadScene`, …) is reachable through a template
 * ref — the component {@link OhDiagramController.constructor exposes} the
 * curated controller surface.
 */
export const OhDiagram = defineComponent({
  name: "OhDiagram",
  props: {
    scene: { type: Object as PropType<Scene>, default: undefined },
    theme: { type: String as PropType<DiagramTheme>, default: undefined },
    renderer: { type: String as PropType<DiagramRenderer>, default: undefined },
    grid: { type: Boolean, default: false },
    snap: { type: Boolean, default: false },
  },
  emits: {
    ready: (_payload: OhDiagramEventMap["ready"]) => true,
    scenechange: (_scene: OhDiagramEventMap["scenechange"]) => true,
    selectionchange: (_ids: OhDiagramEventMap["selectionchange"]) => true,
    themechange: (_theme: OhDiagramEventMap["themechange"]) => true,
  },
  // No default slot — the editor owns its content. Declared for typing only.
  slots: Object as SlotsType<Record<never, never>>,
  setup(props, { emit, expose }) {
    const elRef = ref<OhDiagramElement | null>(null);
    let unbind: (() => void) | null = null;

    const sync = (): void => {
      if (elRef.value) applyOhDiagramProps(elRef.value, props);
    };

    onMounted(() => {
      const el = elRef.value;
      if (!el) return;
      applyOhDiagramProps(el, props);
      unbind = bindOhDiagramEvents(el, {
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

    // One watcher over every prop — `applyOhDiagramProps` is idempotent.
    watch(() => [props.scene, props.theme, props.renderer, props.grid, props.snap], sync);

    onBeforeUnmount(() => {
      unbind?.();
      unbind = null;
    });

    expose(ohDiagramController(() => elRef.value) satisfies OhDiagramController);

    return () =>
      h("oh-diagram", {
        ref: elRef,
        style: "display:block;width:100%;height:100%",
      });
  },
});

export default OhDiagram;
