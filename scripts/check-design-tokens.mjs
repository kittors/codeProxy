import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { exit } from "node:process";

const root = resolve(import.meta.dirname, "..");
const SCANNED_DIRS = ["apps", "pages", "features", "packages"];
const ALLOWED_FONT_SIZES = new Set([10, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60]);
const ALLOWED_RADII = new Set([0, 2, 4, 6, 8, 12, 16, 24, 32, 9999]);

const violations = [];

function report(filePath, content, index, message) {
  const line = content.slice(0, index).split("\n").length;
  violations.push(`${relative(root, filePath)}:${line} ${message}`);
}

function checkFile(filePath) {
  const content = readFileSync(filePath, "utf8");

  for (const match of content.matchAll(/text-\[(\d*\.?\d+)(px|rem)\]/g)) {
    report(
      filePath,
      content,
      match.index,
      `使用了任意字号 ${match[0]}，请改用 text-2xs 至 text-6xl`,
    );
  }

  for (const match of content.matchAll(/rounded(?:-[trblxy]{1,2})?-\[(\d*\.?\d+)(px|rem)\]/g)) {
    report(
      filePath,
      content,
      match.index,
      `使用了任意圆角 ${match[0]}，请改用 rounded-xs 至 rounded-4xl/full`,
    );
  }

  for (const match of content.matchAll(/fontSize\s*:\s*["']?(\d*\.?\d+)(?:px)?["']?/g)) {
    const value = Number(match[1]);
    if (!ALLOWED_FONT_SIZES.has(value)) {
      report(filePath, content, match.index, `fontSize ${value}px 不在全局字号规范内`);
    }
  }

  for (const match of content.matchAll(/borderRadius\s*:\s*(\d*\.?\d+)/g)) {
    const value = Number(match[1]);
    if (!ALLOWED_RADII.has(value)) {
      report(filePath, content, match.index, `borderRadius ${value}px 不在全局圆角规范内`);
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
  const path = join(root, dir);
  if (existsSync(path)) walk(path);
}

if (violations.length > 0) {
  console.error(`\n❌ Found ${violations.length} design token violation(s):\n`);
  for (const violation of violations) console.error(`  ${violation}`);
  console.error();
  exit(1);
}

console.log("\n✅ Typography and radius tokens are consistent.\n");
