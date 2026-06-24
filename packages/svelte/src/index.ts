// The component itself ships as `OhDiagram.svelte` and is resolved through the
// package's `svelte` export condition (a Svelte-aware bundler compiles it).
// This entry only re-exports the shared typed surface so hosts can import the
// prop / event / controller types from the same package.
export type {
  DiagramRenderer,
  DiagramTheme,
  OhDiagramController,
  OhDiagramEventMap,
  OhDiagramProps,
} from "@oh-just-another/element";
