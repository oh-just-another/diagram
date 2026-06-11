import { defineConfig } from "vitest/config";

// Root-level Vitest config. The per-package projects come from
// `vitest.workspace.ts`; this file carries the cross-project COVERAGE settings
// for the merged report produced by `vitest run --coverage`.
//
// Thresholds (L0–L1 ≥ 90%, everything else ≥ 75%) are only enforced when the
// `COV_GATE` env var is set (the `test:coverage:gate` script) so the everyday
// `test:coverage` stays a non-failing report.
const CORE_GLOB = "packages/{types,math,events,tokens,scene,renderer-core,history}/src/**";
const REST_GLOB = "packages/*/src/**";
const CLI_GLOB = "apps/cli/src/**";

const t = (n: number) => ({ statements: n, branches: n, functions: n, lines: n });

export default defineConfig({
  test: {
    // A root config alongside vitest.workspace.ts must NOT relax per-file
    // isolation — without this the merged run shares processes across projects
    // and leaks globals (collab's WebCrypto tests flake). Pin forks + isolate.
    pool: "forks",
    isolate: true,
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/cli/src/**"],
      reporter: ["text", "html"],
      ...(process.env.COV_GATE
        ? {
            thresholds: {
              [CORE_GLOB]: t(90),
              [REST_GLOB]: t(75),
              [CLI_GLOB]: t(75),
            },
          }
        : {}),
    },
  },
});
