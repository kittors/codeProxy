# codeProxy Bundle Baseline

更新时间：2026-11-27 20:42 +0800（彻底卸载 `framer-motion` 并统一全部 Select/DateTimePicker/ScrollArea 到 Satin 原生浮层与微动效体系，消除 122.21 kB / 40.36 kB gzip 的 `vendor-animation` chunk）

## 当前构建命令

```bash
cd /Users/kittors/Developer/opensource/CliProxy/codeProxy
bun run build
```

## 当前关键产物

| Chunk                   |       Size |      Gzip | 备注                                                                        |
| ----------------------- | ---------: | --------: | --------------------------------------------------------------------------- |
| `vendor-echarts`        | 1118.03 kB | 375.96 kB | 图表主依赖，明显过大；6.1.0 为 XSS 安全修复（GHSA-fgmj-fm8m-jvvx）后的体积 |
| `vendor-satin`          |  126.76 kB |  43.70 kB | Satin UI 核心引擎（含 149 枚 Solar 双色调图标、浮层定位/关闭栈、Avatar、Progress、NumberFlow、ScrollArea、EmptyArt、Loader、CommandPalette 等） |
| `vendor-satin-markdown` |   35.45 kB |  14.42 kB | 按需懒加载的零依赖 Satin Markdown 渲染器（取代原 263.84 kB gzip 的 `vendor-markdown`，净减重 -249.42 kB gzip） |
| `index`                 |  329.29 kB | 103.80 kB | 主入口脚本（彻底卸载 `framer-motion`，消除 122.21 kB / 40.36 kB gzip 的 `vendor-animation` chunk） |
| `index.css`             |  759.31 kB | 135.70 kB | 入口样式表（移除 `FloatingPanel.css` 与旧 `.sn-swapped` 补丁，净减重 -0.89 kB gzip） |
| `ConfigPage`            |  141.41 kB |  42.53 kB | 接入 Satin 分组流体滑块、表单控件与 Solar 图标（-0.91 kB gzip）；低于 `< 80 kB gzip` 页面预算 |
| `AuthFilesPage`         |  254.67 kB |  73.70 kB | 接入 Satin 复选框/加载器/胶囊选择器与 Solar 图标（-1.80 kB gzip）；低于 `< 80 kB gzip` 页面预算 |
| `ProvidersPage`         |  125.80 kB |  33.83 kB | 接入 Satin 控件、复制翻转/测速加载微动效与 Solar 图标（-0.86 kB gzip）；低于 `< 80 kB gzip` 页面预算 |
| `MonitorPage`           |   83.09 kB |  25.31 kB | 监控中心接入 Satin 实时状态胶囊、芯片与 Solar 图标（-1.42 kB gzip）；低于 `< 80 kB gzip` 页面预算 |
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
