import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { exit } from "node:process";

/*
 * 外观变体的成对检查。
 *
 * 多彩样式是叠在简约基础类上的变体类（colorful: / icon-hue: / bar-semantic:，见
 * apps/admin-panel/src/styles/index.css 顶部）。变体类在生成的样式里排在 dark: 之后，所以只写了
 * 浅色值的多彩类在深色模式下也会生效：实色填充（bg-emerald-500）两种模式共用没有问题，但浅色专用
 * 的值——深色文字（text-*-600…950）、浅色淡底（bg-*-50…200）——落到深色底上就看不清了。
 * 这类类名必须在同一个字符串里配一个同变体的 dark: 版本。
 */

const root = resolve(import.meta.dirname, "..");
const SCANNED_DIRS = ["apps", "pages", "features", "packages"];
const VARIANTS = ["colorful", "icon-hue", "bar-semantic"];
const LIGHT_ONLY = [
  { group: "text", pattern: /^text-[a-z]+-(600|700|800|900|950)(\/[\d.[\]]+)?$/ },
  { group: "bg", pattern: /^bg-[a-z]+-(50|100|200)(\/[\d.[\]]+)?$/ },
  { group: "from", pattern: /^from-[a-z]+-(50|100|200)(\/[\d.[\]]+)?$/ },
  { group: "to", pattern: /^to-[a-z]+-(50|100|200)(\/[\d.[\]]+)?$/ },
];
const COLOR_GROUPS = new Set(LIGHT_ONLY.map((rule) => rule.group));

const violations = [];

function utilityGroup(utility) {
  const prefix = utility.split("-")[0];
  return COLOR_GROUPS.has(prefix) ? prefix : null;
}

function checkClassString(filePath, content, index, value) {
  const classes = value.split(/\s+/).filter(Boolean);
  for (const variant of VARIANTS) {
    const darkGroups = new Set();
    for (const cls of classes) {
      const darkUtility = cls.startsWith(`${variant}:dark:`)
        ? cls.slice(`${variant}:dark:`.length)
        : cls.startsWith(`dark:${variant}:`)
          ? cls.slice(`dark:${variant}:`.length)
          : null;
      if (darkUtility) {
        const group = utilityGroup(darkUtility);
        if (group) darkGroups.add(group);
      }
    }
    for (const cls of classes) {
      if (!cls.startsWith(`${variant}:`) || cls.startsWith(`${variant}:dark:`)) continue;
      const utility = cls.slice(`${variant}:`.length);
      const rule = LIGHT_ONLY.find((candidate) => candidate.pattern.test(utility));
      if (rule && !darkGroups.has(rule.group)) {
        const line = content.slice(0, index).split("\n").length;
        violations.push(
          `${relative(root, filePath)}:${line} ${cls} 是浅色专用的值，同一字符串里缺少 ${variant}:dark:${rule.group}-*`,
        );
      }
    }
  }
}

function checkFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  if (!VARIANTS.some((variant) => content.includes(`${variant}:`))) return;
  for (const match of content.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (VARIANTS.some((variant) => value.includes(`${variant}:`))) {
      checkClassString(filePath, content, match.index, value);
    }
  }
}

function walk(dirPath) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith("."))
      continue;
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      checkFile(fullPath);
  }
}

for (const dir of SCANNED_DIRS) {
  const path = join(root, dir);
  if (existsSync(path)) walk(path);
}

if (violations.length > 0) {
  console.error(`\n❌ ${violations.length} 处外观变体缺少深色配对：\n`);
  for (const violation of violations) console.error(`  ${violation}`);
  console.error();
  exit(1);
}

console.log("\n✅ Appearance variants have their dark-mode pairs.\n");
