// The component itself ships as `Diagram.svelte` and is resolved through the
// package's `svelte` export condition (a Svelte-aware bundler compiles it).
// This entry only re-exports the shared typed surface so hosts can import the
// prop / event / controller types from the same package.
export type {
  DiagramRenderer,
  DiagramTheme,
  OjaDiagramController,
  OjaDiagramEventMap,
  OjaDiagramProps,
} from "@oh-just-another/diagram";
