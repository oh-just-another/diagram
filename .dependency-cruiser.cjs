// @ts-check
/**
 * Dependency-cruiser config — enforces package layering and core purity.
 *
 * Layers: a package may import only same-or-lower levels; importing a
 * HIGHER level is forbidden. Leaf packages with no internal deps
 * (glyph-atlas, curve-mesh, renderer-workers) sit where their consumers
 * require them — what matters is that every real edge points same-or-down.
 */
const LEVELS = [
  ["types", "math", "events", "tokens"], // L0 — primitives
  ["scene", "renderer-core", "history", "glyph-atlas", "curve-mesh", "renderer-workers"], // L1 — core + render-leaves
  [
    "renderer-canvas",
    "renderer-svg",
    "state",
    "serialization",
    "templates",
    "raster-wasm",
    "text-wasm",
  ], // L2 — implementations
  ["headless", "exporter", "importers", "versioning", "templates-jsx"], // L3 — adapters
  ["network", "collab"], // L4 — integration
  ["react-ui"], // L5 — UI
  ["editor"], // L6 — umbrella (drop-in editor component)
  ["element"], // L7 — framework-neutral custom element wrapping the editor
];

/** Core packages (L0–L1) that must stay pure: no React / DOM / Node API. */
const CORE = ["types", "math", "events", "tokens", "scene", "renderer-core", "history"];

const group = (names) => `^packages/(${names.join("|")})/`;

/** One forbidden rule per level: that level must not reach a higher one. */
const layeringRules = LEVELS.flatMap((names, i) => {
  const higher = LEVELS.slice(i + 1).flat();
  if (higher.length === 0) return [];
  return [
    {
      name: `no-upward-from-L${i}`,
      comment: `A level-${i} package must not import a higher-level package.`,
      severity: "error",
      from: { path: group(names) },
      to: { path: group(higher) },
    },
  ];
});

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "Runtime circular dependency — the value graph must stay acyclic. " +
        "Type-only edges are not analysed (tsPreCompilationDeps:false), so a cycle broken by an " +
        "`import type` (erased at compile time, no init-order hazard) is correctly not reported.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-no-react",
      comment: "Core (L0–L1) must not import React.",
      severity: "error",
      from: { path: `^packages/(${CORE.join("|")})/src` },
      to: { path: "^(react|react-dom|preact)(/|$)" },
    },
    {
      name: "core-no-node-builtins",
      comment: "Core (L0–L1) must not import Node built-ins (fs/path/…) — keep it isomorphic.",
      severity: "error",
      from: { path: `^packages/(${CORE.join("|")})/src` },
      to: { dependencyTypes: ["core"] },
    },
    ...layeringRules,
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Cruise only first-party source; tests/dist/wasm-glue aren't part of the
    // public dependency graph we enforce.
    includeOnly: "^(packages|apps)/[^/]+/src/",
    exclude: { path: "\\.(test|spec)\\.[tj]sx?$|/__tests__/|\\.d\\.ts$" },
    tsConfig: { fileName: "tsconfig.depcruise.json" },
    // Analyse only value (runtime) imports. Type-only edges are erased at
    // compile time — they create neither bundle coupling nor init-order
    // cycles, and would produce false-positive cycles.
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
