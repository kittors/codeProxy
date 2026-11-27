#!/usr/bin/env node
/* global process */ // 在 Node 里跑（这个目录的 ESLint 配置按浏览器代码来）
// npx satin-ui init / add / check / doctor / skill：命令行工具在 satin-cli 包里（建项目、装技能、拷配方要带模板，不放进组件库本身），这里转过去。
// 找 satin-cli 的顺序：装在项目里的 → Satin 仓库里的 packages/satin-cli（还没发布时的本地用法）→ 都没有就说清楚怎么装
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tries = [
  () => path.join(path.dirname(createRequire(path.join(process.cwd(), "noop.js")).resolve("satin-cli/package.json")), "src/cli.js"),
  () => path.join(path.dirname(createRequire(import.meta.url).resolve("satin-cli/package.json")), "src/cli.js"),
  () => path.resolve(here, "../../satin-cli/src/cli.js"),
];
let entry = null;
for (const t of tries) { try { const f = t(); if (fs.existsSync(f)) { entry = f; break; } } catch { /* 下一个 */ } }

if (!entry) {
  console.log(`satin-ui 的命令行工具在 satin-cli 包里，这里没找到。可以：
  npx satin-cli ${process.argv.slice(2).join(" ") || "init"}
或者装进项目：npm i -D satin-cli，然后 npx satin ${process.argv.slice(2).join(" ") || "init"}`);
  process.exitCode = 1;
} else {
  const { main } = await import(pathToFileURL(entry).href);
  process.exitCode = await main(process.argv.slice(2));
}
