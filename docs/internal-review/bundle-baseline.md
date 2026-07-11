# codeProxy Bundle Baseline

更新时间：2026-07-11 16:42:00 +0800

## 当前构建命令

```bash
cd /Users/kittors/Developer/opensource/CliProxy/codeProxy
bun run build
```

## 当前关键产物

| Chunk                |       Size |      Gzip | 备注                                                                        |
| -------------------- | ---------: | --------: | --------------------------------------------------------------------------- |
| `vendor-echarts`     | 1110.90 kB | 368.34 kB | 图表主依赖，明显过大                                                        |
| `vendor-markdown`    |  761.13 kB | 261.12 kB | Markdown + syntax highlighter 组合                                          |
| `vendor-animation`   |  126.13 kB |  41.83 kB | 动画依赖独立 vendor chunk                                                   |
| `vendor-charts`      |    0.07 kB |   0.08 kB | Chart.js 入口当前几乎未进入业务路径                                         |
| `index`              |  304.11 kB |  93.99 kB | 接受本轮侧边栏稳定交互与全局浮层规范；后续仍需持续往下压                  |
| `ConfigPage`         |  118.44 kB |  32.93 kB | 页面 chunk 低于预算                                                         |
| `AuthFilesPage`      |  221.86 kB |  59.92 kB | 身份多档案与出站策略交互加入后仍低于页面 gzip 预算                          |
| `ProvidersPage`      |  113.50 kB |  28.33 kB | 已低于 `< 80 kB gzip` 页面预算                                              |
| `MonitorPage`        |   24.48 kB |   6.81 kB | 已拆为 toolbar / state hook / dashboard sections                            |
| `LogsPage`           |   19.36 kB |   5.80 kB | 已拆为 live logs / error logs / helpers                                     |
| `EChartRenderer`     |    3.71 kB |   1.39 kB | 图表实际渲染器按需要加载                                                    |
| `LogContentModal`    |   44.82 kB |  12.96 kB | 已从主详情弹窗中拆出 Markdown 渲染重依赖                                    |
| `rendering-markdown` |   14.34 kB |   2.73 kB | 按交互加载的 Markdown 入口，重依赖在 `vendor-markdown`                      |

## 目标预算

- 单页面业务 chunk：优先控制在 `< 80 kB gzip`
- 重依赖 vendor：必须按场景拆分
- `index` 主入口：持续往下压，避免承载低频模块

## 页面级预算跟踪

| 页面/模块         |                  当前体积 | 预算状态       | 最近治理结果                                                                                                    |
| ----------------- | ------------------------: | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `AuthFilesPage`   | 221.86 kB / 59.92 kB gzip | 通过           | 新增 Codex 身份多档案与出站选择后仍低于页面 gzip 预算，后续继续关注 chunk 治理 |
| `ConfigPage`      | 118.44 kB / 32.93 kB gzip | 通过           | 已拆出 runtime panel / visual payload editors，并复用 feature 侧 visual config hook |
| `ProvidersPage`   | 113.50 kB / 28.33 kB gzip | 通过且低于预算 | OpenAI tab、usage summary、provider editor hooks 已完成拆分 |
| `LogContentModal` |  44.82 kB / 12.96 kB gzip | 通过且低于预算 | Markdown 渲染改为按交互懒加载，保留完整内容查看能力 |
| `MonitorPage`     |  24.48 kB /  6.81 kB gzip | 通过且低于预算 | 拆出 `MonitorToolbarSection`、`MonitorDashboardSections`、`useMonitorDashboardState` |

## 下一步

- `AuthFilesPage` 继续拆到 600 行以内，并补 quota / session cache / OAuth 状态转换测试
- `ConfigPage` 与 CodeMirror 场景继续按交互拆分，避免低频编辑器进入常用路径
- `CodeMirror` 场景继续按交互拆分，避免低频编辑器进入常用路径
- `vendor-echarts` 仍然偏大，后续需要继续按图表场景和库边界细分 chunk
