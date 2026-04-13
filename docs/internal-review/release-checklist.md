# Release Checklist

更新时间：2026-04-13

## 后端

```bash
cd /Users/kittors/Developer/opensource/CliProxy/CliRelay
go test ./...
```

检查项：

- Trusted Proxies 已显式配置
- CORS allowlist 行为符合预期
- public lookup 限流与 `no-store` 生效
- multipart 上传大小限制生效
- pprof 默认不对外

## 前端

```bash
cd /Users/kittors/Developer/opensource/CliProxy/codeProxy
bun run check
```

检查项：

- lint 为 0 warning / 0 error
- 构建通过
- 高敏值不进入 URL
- AuthFiles / LogContentModal 相关高敏下载仍保留确认

## 大文件与 bundle

```bash
/Users/kittors/Developer/opensource/CliProxy/scripts/scan-large-files.sh
```

人工检查：

- 页面是否新增超大文件
- bundle 是否出现新的大 chunk
- 是否引入了新的重依赖
