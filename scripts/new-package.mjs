#!/usr/bin/env node
// Scaffolds a new package skeleton.
// Usage: pnpm new-package <name> [--app]
//  pnpm new-package my-package     → packages/my-package
//  pnpm new-package my-app --app    → apps/my-app

import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const args = process.argv.slice(2);
const isApp = args.includes("--app");
const name = args.find((a) => !a.startsWith("--"));

if (!name) {
 console.error("Usage: pnpm new-package <name> [--app]");
 process.exit(1);
}

if (!/^[a-z][a-z0-9-]*$/.test(name)) {
 console.error("Package name must be lowercase letters, digits, and hyphens.");
 process.exit(1);
}

const baseDir = isApp ? "apps" : "packages";
const pkgRoot = join(repoRoot, baseDir, name);
const pkgScope = "@oh-just-another";

async function exists(path) {
 try {
  await access(path);
  return true;
 } catch {
  return false;
 }
}

if (await exists(pkgRoot)) {
 console.error(`Already exists: ${pkgRoot}`);
 process.exit(1);
}

await mkdir(join(pkgRoot, "src"), { recursive: true });
await mkdir(join(pkgRoot, "tests"), { recursive: true });

const packageJson = {
 name: `${pkgScope}/${name}`,
 version: "0.0.0",
 description: `${name} package`,
 type: "module",
 main: "./dist/index.js",
 module: "./dist/index.js",
 types: "./dist/index.d.ts",
 exports: {
  ".": {
   types: "./dist/index.d.ts",
   import: "./dist/index.js",
  },
 },
 files: ["dist", "README.md", "CHANGELOG.md"],
 sideEffects: false,
 scripts: {
  build: "tsc -b tsconfig.build.json",
  typecheck: "tsc --noEmit",
  test: "vitest run",
  "test:watch": "vitest",
  lint: "eslint src tests",
  clean: "rm -rf dist *.tsbuildinfo",
 },
 publishConfig: isApp ? { access: "restricted" } : { access: "public" },
 ...(isApp ? { private: true } : {}),
};

await writeFile(join(pkgRoot, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");

// tsconfig.json — for IDE/eslint, no emit, includes both src and tests
const tsconfig = {
 extends: "../../tsconfig.base.json",
 compilerOptions: {
  composite: false,
  declaration: false,
  declarationMap: false,
  noEmit: true,
 },
 include: ["src/**/*", "tests/**/*"],
 exclude: ["dist", "node_modules"],
};

await writeFile(join(pkgRoot, "tsconfig.json"), JSON.stringify(tsconfig, null, 2) + "\n");

// tsconfig.build.json — for the production build into dist, composite, src only
const tsconfigBuild = {
 extends: "../../tsconfig.base.json",
 compilerOptions: {
  outDir: "./dist",
  rootDir: "./src",
  tsBuildInfoFile: "./dist/.tsbuildinfo",
 },
 include: ["src/**/*"],
 exclude: ["dist", "node_modules", "tests", "**/*.test.ts", "**/*.spec.ts"],
 references: [],
};

await writeFile(
 join(pkgRoot, "tsconfig.build.json"),
 JSON.stringify(tsconfigBuild, null, 2) + "\n",
);

const indexTs = `export const name = "${pkgScope}/${name}";\n`;
await writeFile(join(pkgRoot, "src", "index.ts"), indexTs);

const smokeTest = `import { describe, it, expect } from "vitest";
import { name } from "../src/index.js";

describe("${pkgScope}/${name}", () => {
 it("exports its name", () => {
  expect(name).toBe("${pkgScope}/${name}");
 });
});
`;
await writeFile(join(pkgRoot, "tests", "smoke.test.ts"), smokeTest);

const vitestConfig = `import { defineConfig } from "vitest/config";

export default defineConfig({
 test: {
  environment: "node",
  include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
  coverage: {
   provider: "v8",
   reporter: ["text", "json"],
   include: ["src/**/*.ts"],
   exclude: ["src/**/index.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
  },
 },
});
`;
await writeFile(join(pkgRoot, "vitest.config.ts"), vitestConfig);

const readme = `# ${pkgScope}/${name}

Package description.

`;
await writeFile(join(pkgRoot, "README.md"), readme);

console.log(`Created ${baseDir}/${name}`);
console.log(`Don't forget to:`);
console.log(` 1. Add to tsconfig.json references (workspace root)`);
console.log(` 2. Run: pnpm install`);
console.log(` 3. Document in architecture documentation`);
