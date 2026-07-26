#!/usr/bin/env node
/**
 * Dependency vulnerability gate.
 *
 * Fails on any advisory at or above MIN_SEVERITY. Advisories that do not apply
 * to this project can be waived, but only in `dependency-audit-waivers.json`
 * and only with a written reason — an unexplained `--ignore` in a CI command is
 * how a real finding gets buried.
 *
 * Waivers are reviewed by re-running this script: one that no longer matches a
 * live advisory is reported as stale so it does not outlive its justification.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exit } from "node:process";

const root = resolve(import.meta.dirname, "..");
const WAIVERS_PATH = join(root, "scripts", "dependency-audit-waivers.json");
const MIN_SEVERITY = "high";
const SEVERITY_ORDER = ["low", "moderate", "high", "critical"];

function loadWaivers() {
  try {
    const parsed = JSON.parse(readFileSync(WAIVERS_PATH, "utf8"));
    return parsed.waivers ?? [];
  } catch {
    return [];
  }
}

function runAudit() {
  try {
    const stdout = execFileSync("bun", ["audit", "--json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    // bun audit exits non-zero when advisories exist; the report is still on stdout.
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        console.error("Could not parse `bun audit --json` output.");
        console.error(error.stdout.slice(0, 2000));
        exit(1);
      }
    }
    // An older bun reports `bun audit` as a missing *script*. Fail loudly: a
    // security gate that silently passes when its tool is unavailable is worse
    // than no gate, because the green check implies the scan ran.
    if (String(error.message).includes('Script not found "audit"')) {
      console.error("`bun audit` is unavailable — bun >= 1.2.15 is required.");
      console.error("Update the bun-version pin in .github/workflows/*.yml.");
    } else {
      console.error(`Failed to run \`bun audit\`: ${error.message}`);
    }
    exit(1);
  }
}

const report = runAudit();
const waivers = loadWaivers();
const waiverByUrl = new Map(waivers.map((w) => [w.advisory, w]));
const minIndex = SEVERITY_ORDER.indexOf(MIN_SEVERITY);

// `bun audit --json` keys advisories by package name.
const findings = [];
for (const [pkg, advisories] of Object.entries(report ?? {})) {
  if (!Array.isArray(advisories)) continue;
  for (const advisory of advisories) {
    const severity = String(advisory.severity ?? "").toLowerCase();
    if (SEVERITY_ORDER.indexOf(severity) < minIndex) continue;
    findings.push({
      pkg,
      severity,
      title: advisory.title ?? "(untitled advisory)",
      url: advisory.url ?? advisory.advisory ?? "",
    });
  }
}

const blocking = [];
const waived = [];
for (const finding of findings) {
  const waiver = waiverByUrl.get(finding.url);
  if (waiver) waived.push({ finding, waiver });
  else blocking.push(finding);
}

const activeUrls = new Set(findings.map((f) => f.url));
const staleWaivers = waivers.filter((w) => !activeUrls.has(w.advisory));

for (const { finding, waiver } of waived) {
  console.log(`⚠️  waived: ${finding.pkg} — ${finding.title}`);
  console.log(`    reason: ${waiver.reason}`);
}

for (const waiver of staleWaivers) {
  console.log(`ℹ️  stale waiver (advisory no longer reported): ${waiver.advisory}`);
  console.log("    Remove it from scripts/dependency-audit-waivers.json.");
}

if (blocking.length > 0) {
  console.error(`\n❌ ${blocking.length} unwaived advisory/advisories at ${MIN_SEVERITY}+:\n`);
  for (const finding of blocking) {
    console.error(`  [${finding.severity}] ${finding.pkg}: ${finding.title}`);
    console.error(`    ${finding.url}`);
  }
  console.error("\nUpgrade the dependency, or add a waiver with a reason in");
  console.error("scripts/dependency-audit-waivers.json if it does not apply here.");
  exit(1);
}

console.log(`\n✅ No unwaived ${MIN_SEVERITY}+ advisories (${waived.length} waived).`);
