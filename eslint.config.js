// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.nx/**",
      "**/*.config.js",
      "**/*.config.mjs",
      // Node-only build / codegen tooling — not part of any tsconfig project,
      // so the type-aware ruleset can't resolve them.
      "**/scripts/*.mjs",
      // Standalone runnable examples — served by their own dev server, not
      // part of the package's tsconfig project.
      "**/example/**",
      // Copy-out starter templates — standalone projects with their own
      // tooling / tsconfig, not part of this workspace's lint surface.
      "templates/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      // This is a graphics codebase — template literals build SVG path /
      // CSS transform / debug strings from numbers (and the odd boolean)
      // constantly. `${n}` is exactly what `allowNumber` is for; wrapping
      // every coordinate in `String()` is noise, not safety. Objects /
      // any / nullish in templates are still errors.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Tests use a looser ruleset: they lean on hand-rolled mocks
    // (`noopTarget` with many empty methods, `as never` casts, `!` on
    // fixture lookups) where production-grade strictness is noise. Type
    // safety of the code under test is still enforced by `tsc` on the
    // package's `tests/**` include — this only relaxes lint.
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/tests/**/*.ts",
      "**/tests/**/*.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/non-nullable-type-assertion-style": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/dot-notation": "off",
    },
  },
  {
    // Root config files aren't part of any package tsconfig project, so the
    // type-aware ruleset (projectService) can't resolve them. Lint them
    // syntactically only.
    files: ["*.config.{ts,mts,cts}", "*.config.cjs", ".dependency-cruiser.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false } },
  },
  {
    // The e2e app is a standalone Playwright project with no tsconfig in the
    // type-aware project graph, so the typed ruleset can't resolve its specs.
    // Lint them syntactically only.
    files: ["apps/e2e/**/*.{ts,tsx}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false } },
  },
  prettier,
);
