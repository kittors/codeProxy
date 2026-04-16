# CliProxy Quality Baseline

更新时间：2026-04-13

## 仓库结构

- 根目录只是工作区，不是 Git 仓库。
- `CliRelay`：Go 后端仓库。
- `codeProxy`：前端管理端仓库。

## 标准命令

### CliRelay

```bash
cd /Users/kittors/Developer/opensource/CliProxy/CliRelay
go test ./...
```

按需快速验证：

```bash
go test ./internal/api/... ./sdk/api/handlers/... ./sdk/cliproxy ./test
```

### codeProxy

```bash
cd /Users/kittors/Developer/opensource/CliProxy/codeProxy
bun run lint
bun run build
bun run check
```

## 当前基线

### 后端

- `go test ./...` 通过。
- 已完成第一批安全基线：Trusted Proxies 显式关闭默认信任、public lookup `no-store`、基础限流、multipart 上传大小限制、主 server 基础 timeout。

### 前端

- `bun run lint` 通过，当前为 `0 warning / 0 error`。
- `bun run build` 通过。
- 仍存在 Vite 大 chunk 告警，未视为构建失败，但属于待治理项。

## 当前高体积产物

基于最近一次 `bun run build`：

| Chunk | Size | Gzip |
| --- | ---: | ---: |
| `vendor-echarts` | 1137.56 kB | 377.94 kB |
| `vendor-markdown` | 779.40 kB | 270.17 kB |
| `index` | 638.96 kB | 187.23 kB |
| `ConfigPage` | 152.30 kB | 44.42 kB |
| `AuthFilesPage` | 101.38 kB | 25.84 kB |

## 当前大文件阈值

- 页面主文件目标：`400-600` 行
- 告警阈值：`> 800` 行
- 阻塞阈值：`> 1200` 行

配套扫描脚本：

```bash
/Users/kittors/Developer/opensource/CliProxy/scripts/scan-large-files.sh
```
