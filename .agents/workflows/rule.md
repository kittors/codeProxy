---
description: 前端项目规范和 CI/CD 检查流程
---

# 前端项目规范

## 项目信息

- **仓库**: `kittors/codeProxy`
- **本地路径**: `/Users/kittors/Developer/opensource/codeProxy`
- **技术栈**: React + TypeScript + Vite + Tailwind CSS
- **包管理器**: Bun（CI 和本地都使用 Bun）
- **分支策略**: 推送到 `dev` 分支即自动触发 CI 部署

## 后端项目信息

- **仓库**: `kittors/CliRelay`
- **本地路径**: `/Users/kittors/Developer/opensource/CliRelay`
- **技术栈**: Go

## CI/CD 流程

### 自动部署
- 推送到 `dev` 分支后，GitHub Actions 会自动构建并部署到服务器
- 工作流文件: `.github/workflows/deploy.yml`
- 部署路径: `/home/web/html/cliproxy-panel/`

### 每次推送后必须执行的检查

// turbo-all

1. 推送代码后等待 90 秒
```bash
sleep 90
```

2. 检查前端 CI 状态
```bash
gh run list --repo kittors/codeProxy --branch dev -L 1 --json databaseId,status,conclusion,displayTitle
```

3. 如果状态为 `in_progress`，再等 60 秒后重新检查
```bash
sleep 60 && gh run list --repo kittors/codeProxy --branch dev -L 1 --json databaseId,status,conclusion,displayTitle
```

4. 如果状态为 `failure`，查看失败日志
```bash
gh run view <RUN_ID> --repo kittors/codeProxy --log-failed 2>&1 | tail -40
```

5. 如果后端也有推送，检查后端 CI 状态
```bash
gh run list --repo kittors/CliRelay -L 3 --json databaseId,status,conclusion,displayTitle,headBranch
```

## 构建命令

```bash
# 本地构建（含 TypeScript 检查）
npm run build

# 安装依赖
bun install

# 开发服务器
npm run dev
```

## i18n 国际化规范

- 翻译文件 `src/i18n/locales/en.json` 和 `src/i18n/locales/zh-CN.json`
- 所有用户可见的文字都必须使用 `t()` 包装
- 每个使用 `t()` 的组件必须有 `const { t } = useTranslation();`
- 添加新翻译时，**必须同时更新** en.json 和 zh-CN.json
