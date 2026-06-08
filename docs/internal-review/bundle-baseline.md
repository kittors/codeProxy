# codeProxy Bundle Baseline

更新时间：2026-05-01 08:48:36 +0800

## 当前构建命令

```bash
cd /Users/kittors/Developer/opensource/CliProxy/codeProxy
bun run build
```

## 当前关键产物

| Chunk                |       Size |      Gzip | 备注                                                                        |
| -------------------- | ---------: | --------: | --------------------------------------------------------------------------- |
| `vendor-echarts`     | 1137.56 kB | 377.94 kB | 图表主依赖，明显过大                                                        |
| `vendor-markdown`    |  779.40 kB | 270.17 kB | Markdown + syntax highlighter 组合                                          |
| `index`              |  639.23 kB | 187.31 kB | 入口基础包仍偏大                                                            |
| `ConfigPage`         |  152.50 kB |  44.45 kB | 页面 chunk 偏大                                                             |
| `AuthFilesPage`      |  137.13 kB |  37.21 kB | 页面主文件已达行数目标，近期额度趋势与 OAuth 交互补齐后仍低于页面 gzip 预算 |
| `ProvidersPage`      |   72.07 kB |  18.34 kB | 已低于 `< 80 kB gzip` 页面预算                                              |
| `MonitorPage`        |   27.11 kB |   6.92 kB | 已拆为 toolbar / state hook / dashboard sections                            |
| `LogsPage`           |   18.96 kB |   5.77 kB | 已拆为 live logs / error logs / helpers                                     |
| `EChart`             |    0.80 kB |   0.45 kB | 图表入口已降为懒加载包装层                                                  |
| `EChartRenderer`     |    2.45 kB |   1.03 kB | 图表实际渲染器按需要加载                                                    |
| `LogContentModal`    |   31.39 kB |   9.50 kB | 已从主详情弹窗中拆出 Markdown 渲染重依赖                                    |
| `rendering-markdown` |   14.64 kB |   2.77 kB | 按交互加载的 Markdown / syntax highlighter 子块                             |

## 目标预算

- 单页面业务 chunk：优先控制在 `< 80 kB gzip`
- 重依赖 vendor：必须按场景拆分
- `index` 主入口：持续往下压，避免承载低频模块

## 页面级预算跟踪

| 页面/模块         |                  当前体积 | 预算状态       | 最近治理结果                                                                                                    |
| ----------------- | ------------------------: | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `AuthFilesPage`   | 137.13 kB / 37.21 kB gzip | 通过           | 主页面已从 4095 行降到 460 行，近期补齐额度趋势与 OAuth 交互测试后仍低于页面 gzip 预算，后续继续关注 chunk 治理 |
| `ConfigPage`      | 152.50 kB / 44.45 kB gzip | 通过           | 已拆出 runtime panel / visual payload editors，后续继续处理编辑器重依赖                                         |
| `ProvidersPage`   |  72.07 kB / 18.34 kB gzip | 通过且低于预算 | OpenAI tab、usage summary、provider editor hooks 已完成拆分                                                     |
| `LogContentModal` |   31.39 kB / 9.50 kB gzip | 通过且低于预算 | Markdown 渲染改为按交互懒加载，保留完整内容查看能力                                                             |
| `MonitorPage`     |   27.11 kB / 6.92 kB gzip | 通过且低于预算 | 拆出 `MonitorToolbarSection`、`MonitorDashboardSections`、`useMonitorDashboardState`                            |

## 下一步

- `AuthFilesPage` 继续拆到 600 行以内，并补 quota / session cache / OAuth 状态转换测试
- `ConfigPage` 与 CodeMirror 场景继续按交互拆分，避免低频编辑器进入常用路径
- `CodeMirror` 场景继续按交互拆分，避免低频编辑器进入常用路径
- `vendor-echarts` 仍然偏大，后续需要继续按图表场景和库边界细分 chunk
