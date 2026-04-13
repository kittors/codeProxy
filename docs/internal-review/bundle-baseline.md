# codeProxy Bundle Baseline

更新时间：2026-04-13 18:06:38 +0800

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
| `EChart` | 0.80 kB | 0.45 kB | 图表入口已降为懒加载包装层 |
| `EChartRenderer` | 2.45 kB | 1.03 kB | 图表实际渲染器按需要加载 |
| `LogContentModal` | 31.43 kB | 9.51 kB | 已从主详情弹窗中拆出 Markdown 渲染重依赖 |
| `rendering-markdown` | 14.64 kB | 2.77 kB | 按交互加载的 Markdown / syntax highlighter 子块 |

## 目标预算

- 单页面业务 chunk：优先控制在 `< 80 kB gzip`
- 重依赖 vendor：必须按场景拆分
- `index` 主入口：持续往下压，避免承载低频模块

## 下一步

- `AuthFilesPage`、`ConfigPage` 拆分后重新记录 chunk 大小
- `CodeMirror` 场景继续按交互拆分，避免低频编辑器进入常用路径
- `vendor-echarts` 仍然偏大，后续需要继续按图表场景和库边界细分 chunk
