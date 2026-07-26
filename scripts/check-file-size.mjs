#!/usr/bin/env node
/**
 * Ratchet gate on source file size.
 *
 * Large files are the repository's main maintainability debt, but they cannot be
 * split in one pass. This gate freezes the current state instead: files already
 * over the threshold are recorded in a baseline and may only shrink, while any
 * new file crossing the threshold fails. That stops the debt from growing
 * without blocking unrelated work on a big-bang refactor.
 *
 * Usage:
 *   node scripts/check-file-size.mjs            # verify against the baseline
 *   node scripts/check-file-size.mjs --update   # rewrite the baseline
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { exit } from "node:process";

const root = resolve(import.meta.dirname, "..");
const BASELINE_PATH = join(root, "scripts", "file-size-baseline.json");
const SCANNED_DIRS = ["apps", "pages", "features", "packages"];
const MAX_LINES = 800;
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", "__tests__", ".turbo"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function isSourceFile(name) {
  if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) return false;
  if (name.endsWith(".d.ts")) return false;
  return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext));
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

function countLines(path) {
  return readFileSync(path, "utf8").split("\n").length;
}

function measure() {
  const sizes = new Map();
  for (const dir of SCANNED_DIRS) {
    for (const file of collectFiles(join(root, dir))) {
      const rel = relative(root, file).replaceAll("\\", "/");
      const lines = countLines(file);
      if (lines > MAX_LINES) sizes.set(rel, lines);
    }
  }
  return new Map([...sizes.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")).files ?? {};
  } catch {
    return {};
  }
}

const current = measure();

if (process.argv.includes("--update")) {
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        comment:
          "Files already over the line limit. They may only shrink — see scripts/check-file-size.mjs.",
        maxLines: MAX_LINES,
        files: Object.fromEntries(current),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`✅ Baseline updated: ${current.size} file(s) over ${MAX_LINES} lines.`);
  exit(0);
}

const baseline = readBaseline();
const added = [];
const grown = [];
const shrunk = [];

for (const [file, lines] of current) {
  const allowed = baseline[file];
  if (allowed === undefined) {
    added.push({ file, lines });
  } else if (lines > allowed) {
    grown.push({ file, lines, allowed });
  } else if (lines < allowed) {
    shrunk.push({ file, lines, allowed });
  }
}

const removed = Object.keys(baseline).filter((file) => !current.has(file));

if (added.length > 0 || grown.length > 0) {
  console.error(`❌ File size gate failed (limit ${MAX_LINES} lines).\n`);
  for (const { file, lines } of added) {
    console.error(`  NEW over limit: ${file} (${lines} lines)`);
    console.error("    Split it, or justify and run: node scripts/check-file-size.mjs --update\n");
  }
  for (const { file, lines, allowed } of grown) {
    console.error(`  GREW: ${file} (${lines} lines, baseline ${allowed})`);
    console.error("    Files already over the limit may only shrink.\n");
  }
  exit(1);
}

if (shrunk.length > 0 || removed.length > 0) {
  console.log("✅ File size gate passed, with progress to record:");
  for (const { file, lines, allowed } of shrunk) {
    console.log(`  shrank: ${file} (${allowed} -> ${lines})`);
  }
  for (const file of removed) {
    console.log(`  now under limit: ${file}`);
  }
  console.log("\nRun `node scripts/check-file-size.mjs --update` to lock in the improvement.");
  exit(0);
}

console.log(`✅ File size gate passed (${current.size} file(s) at the frozen baseline).`);
