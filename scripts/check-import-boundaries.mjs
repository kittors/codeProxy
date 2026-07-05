import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { exit } from "node:process";

const root = resolve(import.meta.dirname, "..");
const SCANNED_DIRS = ["apps", "pages", "features", "packages"];

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s*)?["']([^'"]+)["']|import\s*\(\s*["']([^'"]+)["']\s*\)/g;

const FORBIDDEN_IMPORTS = [
  { pattern: /^@\/modules(?:\/|$)/, reason: "legacy @/modules imports are not allowed" },
  { pattern: /^@\/lib\/http(?:\/|$)/, reason: "HTTP client code lives in @code-proxy/api-client" },
];

const FEATURE_IMPORT_ALLOWLIST = new Set([
  "features/ccswitch-import->features/model-availability",
  "features/oauth-login->features/proxy-pool",
  "features/request-log-viewer->features/model-tags",
  "features/request-log-viewer->features/monitor-widgets",
  "features/routing-config-editor->features/model-availability",
  "features/routing-config-editor->features/visual-config-editor",
]);

function toRelativePath(filePath) {
  return relative(root, resolve(filePath)).replaceAll("\\", "/");
}

function getOwner(rawPath) {
  const rel = toRelativePath(rawPath);
  const parts = rel.split("/");
  const layer = parts[0];

  if (layer === "apps" && parts[1]) {
    return { layer, unit: `apps/${parts[1]}` };
  }

  if (layer === "pages") {
    if (parts.length >= 3) return { layer, unit: `pages/${parts[1]}` };
    return { layer, unit: "pages" };
  }

  if ((layer === "features" || layer === "packages") && parts[1]) {
    return { layer, unit: `${layer}/${parts[1]}` };
  }

  return null;
}

function resolveAlias(importPath) {
  if (importPath.startsWith("@code-proxy/")) {
    const parts = importPath.slice("@code-proxy/".length).split("/");
    const packageName = parts.shift();
    if (!packageName) return null;
    return parts.length > 0
      ? `packages/${packageName}/src/${parts.join("/")}`
      : `packages/${packageName}`;
  }

  if (importPath.startsWith("@pages/")) {
    return `pages/${importPath.slice("@pages/".length)}`;
  }

  if (importPath.startsWith("@features/")) {
    return `features/${importPath.slice("@features/".length)}`;
  }

  if (importPath.startsWith("@app/")) {
    return `apps/admin-panel/src/app/${importPath.slice("@app/".length)}`;
  }

  if (importPath.startsWith("@/")) {
    return `apps/admin-panel/src/${importPath.slice(2)}`;
  }

  return null;
}

function canImport(source, target, resolved) {
  if (source.unit === target.unit) return true;

  if (source.layer === "apps") {
    return ["apps", "pages", "features", "packages"].includes(target.layer);
  }

  if (source.layer === "pages") {
    if (target.layer === "apps") {
      return (
        resolved.startsWith("apps/admin-panel/src/app/providers/") ||
        resolved.startsWith("apps/admin-panel/src/app/update/")
      );
    }
    return ["apps", "features", "packages"].includes(target.layer);
  }

  if (source.layer === "features") {
    if (target.layer === "features") {
      return FEATURE_IMPORT_ALLOWLIST.has(`${source.unit}->${target.unit}`);
    }
    return target.layer === "packages";
  }

  if (source.layer === "packages") {
    if (source.unit === "packages/domain" && target.unit === "packages/api-client") {
      return false;
    }
    return target.layer === "packages";
  }

  return false;
}

const violations = [];

function recordViolation(filePath, importPath, resolved, reason) {
  violations.push({
    file: toRelativePath(filePath),
    importPath,
    resolved,
    reason,
  });
}

function checkFile(filePath) {
  const sourceOwner = getOwner(filePath);
  if (!sourceOwner) return;

  const content = readFileSync(filePath, "utf8");
  IMPORT_PATTERN.lastIndex = 0;

  for (const match of content.matchAll(IMPORT_PATTERN)) {
    const importPath = match[1] ?? match[2];
    if (!importPath || importPath.startsWith(".") || importPath.startsWith("/")) continue;

    const forbidden = FORBIDDEN_IMPORTS.find((entry) => entry.pattern.test(importPath));
    if (forbidden) {
      recordViolation(filePath, importPath, "-", forbidden.reason);
      continue;
    }

    const resolved = resolveAlias(importPath);
    if (!resolved) continue;

    const targetOwner = getOwner(join(root, resolved));
    if (!targetOwner) continue;

    if (!canImport(sourceOwner, targetOwner, resolved)) {
      recordViolation(
        filePath,
        importPath,
        resolved,
        `${sourceOwner.unit} cannot import ${targetOwner.unit}`,
      );
    }
  }
}

function walk(dirPath) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      checkFile(fullPath);
    }
  }
}

for (const dir of SCANNED_DIRS) {
  const absDir = join(root, dir);
  if (existsSync(absDir)) walk(absDir);
}

if (violations.length > 0) {
  console.log(`\n❌ Found ${violations.length} import boundary violation(s):\n`);
  for (const violation of violations) {
    console.log(`  ${violation.file}`);
    console.log(`    imports "${violation.importPath}"`);
    console.log(`    resolved: ${violation.resolved}`);
    console.log(`    ${violation.reason}\n`);
  }
  exit(1);
}

console.log("\n✅ All import boundaries clean.\n");
