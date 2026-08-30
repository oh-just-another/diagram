#!/usr/bin/env node
/**
 * Compare vitest bench results (`vitest bench --outputJson`) against a
 * baseline tree with the same layout, and print a Markdown table (also
 * appended to `$GITHUB_STEP_SUMMARY` when set).
 *
 * Usage: node scripts/bench-compare.mjs <baselineDir> <currentDir>
 *
 * Every `bench-results.json` under `currentDir` (node_modules excluded) is
 * matched by relative path to the baseline. Rows are keyed by
 * `<file> > <group> > <benchmark>` and compared on the mean time per op.
 * A row slower than the baseline by more than `BENCH_REGRESSION_PCT` (default
 * 25) is flagged. The script never fails the job by itself — shared runners
 * are too noisy for a hard gate; set `BENCH_FAIL_ON_REGRESSION=1` to make it
 * exit non-zero when anything is flagged.
 */
import { readdirSync, readFileSync, statSync, existsSync, appendFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const [baselineDir, currentDir = "."] = process.argv.slice(2);
if (!baselineDir) {
  console.error("usage: bench-compare.mjs <baselineDir> [currentDir]");
  process.exit(2);
}
const REGRESSION_PCT = Number(process.env.BENCH_REGRESSION_PCT ?? "25");

const findResults = (root) => {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "bench-results.json") out.push(p);
    }
  };
  if (existsSync(root)) walk(root);
  return out;
};

/** `{ "<relPath> > <group> > <name>": meanMs }` for one results tree. */
const collect = (root) => {
  const rows = new Map();
  for (const file of findResults(root)) {
    const rel = relative(root, file).split(sep).join("/");
    const json = JSON.parse(readFileSync(file, "utf8"));
    for (const f of json.files ?? []) {
      for (const g of f.groups ?? []) {
        for (const b of g.benchmarks ?? []) {
          rows.set(`${rel} > ${g.fullName} > ${b.name}`, b.mean);
        }
      }
    }
  }
  return rows;
};

const current = collect(currentDir);
const baseline = collect(baselineDir);
const fmt = (ms) => (ms >= 1 ? `${ms.toFixed(2)} ms` : `${(ms * 1000).toFixed(1)} µs`);

const lines = [];
let flagged = 0;
if (current.size === 0) {
  lines.push("No `bench-results.json` found under the current tree.");
} else if (baseline.size === 0) {
  lines.push(`No baseline — ${String(current.size)} benchmarks recorded, nothing to compare.`);
} else {
  lines.push("| Benchmark | Baseline | Current | Δ |", "|---|---:|---:|---:|");
  for (const [key, mean] of [...current.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const base = baseline.get(key);
    if (base === undefined) {
      lines.push(`| ${key} | — | ${fmt(mean)} | new |`);
      continue;
    }
    const pct = ((mean - base) / base) * 100;
    const slower = pct > REGRESSION_PCT;
    if (slower) flagged++;
    lines.push(
      `| ${key} | ${fmt(base)} | ${fmt(mean)} | ${pct >= 0 ? "+" : ""}${pct.toFixed(1)} %${slower ? " ⚠️" : ""} |`,
    );
  }
  lines.push(
    "",
    flagged > 0
      ? `⚠️ ${String(flagged)} benchmark(s) slower than the baseline by more than ${String(REGRESSION_PCT)} %.`
      : `No benchmark slower than the baseline by more than ${String(REGRESSION_PCT)} %.`,
  );
}
const report = `## Benchmarks vs. last successful run\n\n${lines.join("\n")}\n`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
if (flagged > 0 && process.env.BENCH_FAIL_ON_REGRESSION === "1") process.exit(1);
