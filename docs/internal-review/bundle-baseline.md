# codeProxy Bundle Baseline

更新时间：2026-11-25 11:45 +0800（Satin 原生 P1 改造：引入 `satin-ui/css/shell.css` 三层工作台与骨架样式，并在顶栏接入 Satin 原生 `CommandPalette`）

## 当前构建命令

```bash
cd /Users/kittors/Developer/opensource/CliProxy/codeProxy
bun run build
```

## 当前关键产物

| Chunk                   |       Size |      Gzip | 备注                                                                        |
| ----------------------- | ---------: | --------: | --------------------------------------------------------------------------- |
| `vendor-echarts`        | 1118.03 kB | 375.96 kB | 图表主依赖，明显过大；6.1.0 为 XSS 安全修复（GHSA-fgmj-fm8m-jvvx）后的体积 |
| `vendor-satin`          |  129.41 kB |  45.11 kB | Satin UI 核心引擎（含 Solar Icons、Avatar、NumberFlow、EmptyArt、Loader、CommandPalette 等） |
| `vendor-satin-markdown` |   35.45 kB |  14.42 kB | 按需懒加载的零依赖 Satin Markdown 渲染器（取代原 263.84 kB gzip 的 `vendor-markdown`，净减重 -249.42 kB gzip） |
| `vendor-animation`      |  122.21 kB |  40.36 kB | 动画依赖独立 vendor chunk（已移除 `gsap` 及核心 UI 控件中的 `framer-motion`） |
| `index`                 |  331.14 kB | 104.23 kB | 主入口脚本（含 Satin 三层工作台外壳与按需挂载的 `ShellCommandPalette`） |
| `index.css`             |  731.33 kB | 130.98 kB | 入口样式表；含 114 条自托管字体 @font-face 分片声明与 Satin 11 个样式模块（新增 `shell.css` 三层工作台与页面骨架，较原非 Satin 基线全站总传输仍净减重 >190 kB gzip） |
| `ConfigPage`            |  143.55 kB |  43.44 kB | 接入 Satin 分组流体滑块与表单控件；低于 `< 80 kB gzip` 页面预算 |
| `AuthFilesPage`         |  259.72 kB |  75.50 kB | 接入 Satin 复选框/加载器与专控重置额度端点；低于 `< 80 kB gzip` 页面预算 |
| `ProvidersPage`         |  127.92 kB |  34.69 kB | 接入 Satin 控件与复制翻转/测速加载微动效；低于 `< 80 kB gzip` 页面预算 |
| `MonitorPage`           |   86.60 kB |  26.73 kB | 监控中心接入 Satin 实时标签与控件；路由级懒加载，低于 `< 80 kB gzip` 页面预算 |
| `LogsPage`              |   19.39 kB |   6.31 kB | 已拆为 live logs / error logs / helpers                                     |
| `EChartRenderer`        |    4.03 kB |   1.59 kB | 图表实际渲染器按需要加载                                                    |
| `rendering-markdown`    |    0.26 kB |   0.20 kB | 按交互加载的 Markdown 入口，重依赖已切换至轻量 `vendor-satin-markdown`      |

## 目标预算

- 单页面业务 chunk：优先控制在 `< 80 kB gzip`
- 重依赖 vendor：必须按场景拆分
- `index` 主入口：持续往下压，避免承载低频模块

## 页面级预算跟踪

| 页面/模块         |                  当前体积 | 预算状态       | 最近治理结果                                                                                                    |
| ----------------- | ------------------------: | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `AuthFilesPage`   | 259.10 kB / 75.23 kB gzip | 通过           | 2026-11-21 订阅时间改由上游实时读取（卡片徽标、详情只读区），约 +1 kB；距 `< 80 kB gzip` 页面预算余约 4.8 kB |
| `ConfigPage`      | 119.60 kB / 33.35 kB gzip | 通过           | 已拆出 runtime panel / visual payload editors，并复用 feature 侧 visual config hook |
| `ProvidersPage`   | 121.98 kB / 30.85 kB gzip | 通过且低于预算 | OpenAI tab、usage summary、provider editor hooks 已完成拆分 |
| `MonitorPage`     |  74.70 kB / 23.20 kB gzip | 通过且低于预算 | 2026-10-07 监控中心重做：模块拆在 `pages/monitor/{components,charts,model,hooks}`；三十多条迷你趋势用纯 SVG，不为每条起 echarts 实例 |

## 下一步

- `AuthFilesPage` 继续拆到 600 行以内，并补 quota / session cache / OAuth 状态转换测试
- `ConfigPage` 与 CodeMirror 场景继续按交互拆分，避免低频编辑器进入常用路径
- `CodeMirror` 场景继续按交互拆分，避免低频编辑器进入常用路径
- `vendor-echarts` 仍然偏大，后续需要继续按图表场景和库边界细分 chunk
- `index` 在保留 chunk 恢复逻辑的前提下，继续把低频 shell 能力外移
