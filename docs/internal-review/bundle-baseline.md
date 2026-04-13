# codeProxy Bundle Baseline

更新时间：2026-04-13 18:01:39 +0800

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
| `index` | 639.39 kB | 187.38 kB | 入口基础包仍偏大 |
| `ConfigPage` | 152.30 kB | 44.42 kB | 页面 chunk 偏大 |
| `AuthFilesPage` | 106.22 kB | 28.44 kB | 巨型页面导致业务 chunk 偏大 |
| `LogContentModal` | 31.43 kB | 9.51 kB | 已从主详情弹窗中拆出 Markdown 渲染重依赖 |
| `rendering-markdown` | 14.64 kB | 2.77 kB | 按交互加载的 Markdown / syntax highlighter 子块 |

## 目标预算

- 单页面业务 chunk：优先控制在 `< 80 kB gzip`
- 重依赖 vendor：必须按场景拆分
- `index` 主入口：持续往下压，避免承载低频模块

## 下一步

- `EChart` 使用场景进一步懒加载
- `AuthFilesPage`、`ConfigPage` 拆分后重新记录 chunk 大小
- `CodeMirror` 场景继续按交互拆分，避免低频编辑器进入常用路径
