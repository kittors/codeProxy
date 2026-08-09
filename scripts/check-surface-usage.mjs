#!/usr/bin/env node
/**
 * Ratchet gate on hand-rolled card surfaces.
 *
 * "A bordered box" is three decisions — radius, edge, fill — and they were being
 * re-made inline at every call site. That produced 69 distinct combinations
 * across 166 places, so no two pages agreed on what a card looks like and a
 * change to the house style had to be applied by hand, everywhere.
 *
 * `surface()` in @code-proxy/ui is now the single source of truth. Existing
 * inline surfaces are frozen in a baseline and may only decrease; any new one
 * fails the gate. That stops the divergence from growing without demanding a
 * big-bang rewrite of all 166 sites first.
 *
 * Usage:
 *   node scripts/check-surface-usage.mjs            # verify against the baseline
 *   node scripts/check-surface-usage.mjs --update   # rewrite the baseline
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { exit } from "node:process";

const root = resolve(import.meta.dirname, "..");
const BASELINE_PATH = join(root, "scripts", "surface-usage-baseline.json");
const SCANNED_DIRS = ["apps", "pages", "features", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", "__tests__", ".turbo"]);

// The shared edge token. Any class string carrying it is styling a surface by
// hand — the one exception is Surface.tsx itself, which defines it.
const EDGE = "border border-slate-900/8";
const ALLOWED = new Set(["packages/ui/src/primitives/Surface.tsx"]);

function isSourceFile(name) {
  if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) return false;
  if (name.endsWith(".d.ts")) return false;
  return name.endsWith(".ts") || name.endsWith(".tsx");
}

function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(join(dir, entry.name), out);
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function countInlineSurfaces(text) {
  let count = 0;
  let index = text.indexOf(EDGE);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(EDGE, index + EDGE.length);
  }
  return count;
}

const counts = {};
for (const dir of SCANNED_DIRS) {
  for (const file of collectFiles(join(root, dir))) {
    const rel = relative(root, file).split("\\").join("/");
    if (ALLOWED.has(rel)) continue;
    const n = countInlineSurfaces(readFileSync(file, "utf8"));
    if (n > 0) counts[rel] = n;
  }
}

const update = process.argv.includes("--update");
if (update) {
  const files = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  const total = Object.values(files).reduce((sum, n) => sum + n, 0);
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        comment:
          "Hand-rolled card surfaces awaiting migration to surface() from @code-proxy/ui. Counts may only shrink — see scripts/check-surface-usage.mjs.",
        total,
        files,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`✅ Baseline updated: ${total} inline surface(s) across ${Object.keys(files).length} file(s).`);
  exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch {
  console.error(`❌ Missing baseline. Run: node scripts/check-surface-usage.mjs --update`);
  exit(1);
}

const recorded = baseline.files ?? {};
const failures = [];
const improvements = [];

for (const [file, n] of Object.entries(counts)) {
  const was = recorded[file];
  if (was === undefined) {
    failures.push(`  NEW: ${file} (${n} inline surface(s))\n    Use surface()/Surface/Card from @code-proxy/ui instead.`);
  } else if (n > was) {
    failures.push(`  GREW: ${file} (${n}, baseline ${was})\n    Files in the baseline may only shrink.`);
  } else if (n < was) {
    improvements.push(`  shrank: ${file} (${was} -> ${n})`);
  }
}
for (const [file, was] of Object.entries(recorded)) {
  if (counts[file] === undefined) improvements.push(`  cleared: ${file} (was ${was})`);
}

if (failures.length > 0) {
  console.error("❌ Inline card surfaces gate failed.\n");
  console.error(failures.join("\n"));
  console.error("\nBuild bordered boxes with surface({ tone, radius }) so one change restyles them all.");
  exit(1);
}

const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
if (improvements.length > 0) {
  console.log("✅ Inline card surfaces gate passed, with progress to record:");
  console.log(improvements.join("\n"));
  console.log(`\nNow ${total} remaining. Run \`node scripts/check-surface-usage.mjs --update\` to lock it in.`);
} else {
  console.log(`✅ Inline card surfaces gate passed (${total} at the frozen baseline).`);
}
