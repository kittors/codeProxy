# codeProxy Bundle Baseline

更新时间：2026-07-13 11:32:00 +0800

## 当前构建命令

```bash
cd /Users/kittors/Developer/opensource/CliProxy/codeProxy
bun run build
```

## 当前关键产物

| Chunk                |       Size |      Gzip | 备注                                                                        |
| -------------------- | ---------: | --------: | --------------------------------------------------------------------------- |
| `vendor-echarts`     | 1110.90 kB | 369.08 kB | 图表主依赖，明显过大                                                        |
| `vendor-markdown`    |  761.13 kB | 263.84 kB | Markdown + syntax highlighter 组合                                          |
| `vendor-animation`   |  126.21 kB |  41.93 kB | 动画依赖独立 vendor chunk                                                   |
| `vendor-charts`      |    0.07 kB |   0.08 kB | Chart.js 入口当前几乎未进入业务路径                                         |
| `index`              |  372.68 kB | 115.07 kB | 纳入部署后懒加载 chunk 失效自动恢复（单次硬刷新 + ErrorBoundary）；后续仍需往下压 |
| `ConfigPage`         |  119.60 kB |  33.35 kB | 页面 chunk 低于预算                                                         |
| `AuthFilesPage`      |  216.81 kB |  58.90 kB | 身份多档案与出站策略交互加入后仍低于页面 gzip 预算                          |
| `ProvidersPage`      |  121.98 kB |  30.85 kB | 已低于 `< 80 kB gzip` 页面预算                                              |
| `MonitorPage`        |   24.33 kB |   6.80 kB | 已拆为 toolbar / state hook / dashboard sections                            |
| `LogsPage`           |   22.15 kB |   6.51 kB | 已拆为 live logs / error logs / helpers                                     |
| `EChartRenderer`     |    3.76 kB |   1.41 kB | 图表实际渲染器按需要加载                                                    |
| `rendering-markdown` |   14.38 kB |   2.75 kB | 按交互加载的 Markdown 入口，重依赖在 `vendor-markdown`                      |

## 目标预算

- 单页面业务 chunk：优先控制在 `< 80 kB gzip`
- 重依赖 vendor：必须按场景拆分
- `index` 主入口：持续往下压，避免承载低频模块

## 页面级预算跟踪

| 页面/模块         |                  当前体积 | 预算状态       | 最近治理结果                                                                                                    |
| ----------------- | ------------------------: | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `AuthFilesPage`   | 216.81 kB / 58.90 kB gzip | 通过           | 新增 Codex 身份多档案与出站选择后仍低于页面 gzip 预算，后续继续关注 chunk 治理 |
| `ConfigPage`      | 119.60 kB / 33.35 kB gzip | 通过           | 已拆出 runtime panel / visual payload editors，并复用 feature 侧 visual config hook |
| `ProvidersPage`   | 121.98 kB / 30.85 kB gzip | 通过且低于预算 | OpenAI tab、usage summary、provider editor hooks 已完成拆分 |
| `MonitorPage`     |  24.33 kB /  6.80 kB gzip | 通过且低于预算 | 拆出 `MonitorToolbarSection`、`MonitorDashboardSections`、`useMonitorDashboardState` |

## 下一步

- `AuthFilesPage` 继续拆到 600 行以内，并补 quota / session cache / OAuth 状态转换测试
- `ConfigPage` 与 CodeMirror 场景继续按交互拆分，避免低频编辑器进入常用路径
- `CodeMirror` 场景继续按交互拆分，避免低频编辑器进入常用路径
- `vendor-echarts` 仍然偏大，后续需要继续按图表场景和库边界细分 chunk
- `index` 在保留 chunk 恢复逻辑的前提下，继续把低频 shell 能力外移
