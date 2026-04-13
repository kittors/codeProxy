# codeProxy Bundle Baseline

更新时间：2026-04-13

## 当前构建命令

```bash
cd /Users/kittors/Developer/opensource/CliProxy/codeProxy
bun run build
```

## 当前关键产物

| Chunk | Size | Gzip | 备注 |
| --- | ---: | ---: | --- |
| `vendor-echarts` | 1137.56 kB | 377.94 kB | 图表主依赖，明显过大 |
| `vendor-markdown` | 779.40 kB | 270.17 kB | Markdown + syntax highlighter 组合 |
| `index` | 638.96 kB | 187.23 kB | 入口基础包仍偏大 |
| `ConfigPage` | 152.30 kB | 44.42 kB | 页面 chunk 偏大 |
| `AuthFilesPage` | 101.38 kB | 25.84 kB | 巨型页面导致业务 chunk 偏大 |

## 目标预算

- 单页面业务 chunk：优先控制在 `< 80 kB gzip`
- 重依赖 vendor：必须按场景拆分
- `index` 主入口：持续往下压，避免承载低频模块

## 下一步

- `LogContentModal` 的 Markdown / syntax highlighter 改为按交互动态加载
- `EChart` 使用场景进一步懒加载
- `AuthFilesPage`、`ConfigPage` 拆分后重新记录 chunk 大小
