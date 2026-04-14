#!/usr/bin/env node
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const distAssetsDir = join(root, "dist", "assets");
const baselinePath = join(root, "docs", "internal-review", "bundle-baseline.md");
const defaultOutputPath = resolve(
  root,
  "..",
  ".omx",
  "logs",
  "phase-4-bundle-diff.md",
);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const value = process.argv[index + 1]?.startsWith("--") ? "true" : process.argv[index + 1];
  args.set(key, value ?? "true");
  if (value !== "true") index += 1;
}

const outputPath = resolve(String(args.get("output") ?? defaultOutputPath));
const budgetGzipKb = Number(args.get("budget-gzip-kb") ?? 80);
const toleranceKb = Number(args.get("tolerance-kb") ?? 5);

const readBaseline = () => {
  const text = readFileSync(baselinePath, "utf8");
  const rows = new Map();
  const rowPattern = /^\| `([^`]+)` \| ([\d.]+) kB \| ([\d.]+) kB \|/gm;
  let match;
  while ((match = rowPattern.exec(text))) {
    rows.set(match[1], {
      sizeKb: Number(match[2]),
      gzipKb: Number(match[3]),
    });
  }
  return rows;
};

const findCurrentChunks = (baselineKeys) => {
  const chunks = new Map();
  for (const name of readdirSync(distAssetsDir)) {
    const path = join(distAssetsDir, name);
    if (!statSync(path).isFile()) continue;
    const stem =
      baselineKeys.find((key) => name === key || name.startsWith(`${key}-`) || name.startsWith(`${key}.`)) ??
      (() => {
        const withoutExt = name.replace(/\.(?:[cm]?js|css|svg)$/, "");
        const separatorIndex = withoutExt.lastIndexOf("-");
        return separatorIndex === -1 ? withoutExt : withoutExt.slice(0, separatorIndex);
      })();
    const data = readFileSync(path);
    const sizeKb = data.byteLength / 1024;
    const gzipKb = gzipSync(data).byteLength / 1024;
    const previous = chunks.get(stem);
    if (!previous || gzipKb > previous.gzipKb) {
      chunks.set(stem, { file: basename(path), sizeKb, gzipKb });
    }
  }
  return chunks;
};

const formatKb = (value) => `${value.toFixed(2)} kB`;
const formatDelta = (value) => {
  if (!Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)} kB`;
};

const baseline = readBaseline();
const current = findCurrentChunks(Array.from(baseline.keys()));
const tracked = Array.from(baseline.keys()).filter((key) => current.has(key));
const missing = Array.from(baseline.keys()).filter((key) => !current.has(key));
const rows = tracked.map((key) => {
  const base = baseline.get(key);
  const now = current.get(key);
  const deltaGzip = now.gzipKb - base.gzipKb;
  const overPageBudget = !key.startsWith("vendor-") && now.gzipKb > budgetGzipKb;
  const overTolerance = deltaGzip > toleranceKb;
  return {
    key,
    base,
    now,
    deltaGzip,
    overPageBudget,
    overTolerance,
  };
});

const failures = rows.filter((row) => row.overPageBudget || row.overTolerance);
const generatedAt = new Date().toISOString();
const markdown = [
  "# Bundle Diff Report",
  "",
  `Generated at: \`${generatedAt}\``,
  `Baseline: \`${baselinePath}\``,
  `Budget: non-vendor gzip <= \`${budgetGzipKb} kB\`; gzip delta tolerance <= \`${toleranceKb} kB\``,
  "",
  "| Chunk | Current | Current gzip | Baseline gzip | Delta gzip | Status |",
  "| --- | ---: | ---: | ---: | ---: | --- |",
  ...rows.map((row) => {
    const status =
      row.overPageBudget || row.overTolerance
        ? [
            row.overPageBudget ? "over page budget" : null,
            row.overTolerance ? "over delta tolerance" : null,
          ]
            .filter(Boolean)
            .join("; ")
        : "ok";
    return `| \`${row.key}\` | ${formatKb(row.now.sizeKb)} | ${formatKb(row.now.gzipKb)} | ${formatKb(row.base.gzipKb)} | ${formatDelta(row.deltaGzip)} | ${status} |`;
  }),
  "",
  missing.length ? `Missing tracked chunks: ${missing.map((key) => `\`${key}\``).join(", ")}` : "Missing tracked chunks: none",
  "",
  failures.length
    ? `Result: FAIL (${failures.length} tracked chunk budget issue${failures.length === 1 ? "" : "s"})`
    : "Result: PASS",
  "",
].join("\n");

writeFileSync(outputPath, markdown);
console.log(`Bundle diff written to ${outputPath}`);
if (failures.length) {
  console.error(markdown);
  process.exit(1);
}
