# Git 与提交规范（含安全规则）

## 1. 安全红线（强制）

1) **禁止** 任何会访问或修改远程仓库的操作（`fetch/pull/push`、改 remote 等），除非用户明确同意并说明目标。

2) **禁止** 会丢失未提交改动的操作（`reset`、`clean`、`restore`、`checkout --`、`stash`、`rebase` 等），除非用户明确同意并了解影响。

如果确需执行，必须先用中文说明：

- 将要执行的命令
- 影响的文件范围
- 是否会丢失未提交内容
- 替代方案（例如仅回退某个文件的某一段改动）

## 2. 提交信息格式（建议遵守）

```
<type>(<scope>): <subject>
type: feat | fix | refactor | perf | test | docs | chore
```

建议：

- subject 用中文短句，动词开头（例如“修复登录失败提示”）
- scope 用模块名（例如 `login`、`monitor`、`http`、`ui`）

示例：

- `feat(monitor): 增加最近 6/12/24 小时切换`
- `fix(auth): 401 后清理会话并提示重新登录`
- `refactor(http): 抽取配置序列化逻辑到 apis.ts`

## 3. 变更粒度

原则：

- 一次提交只做一件事（同一问题域）
- 避免“顺手重构”混进 bugfix/feature

## 4. 允许的 Git 操作（默认安全）

通常安全且可用于排查的命令：

- `git status`
- `git diff`
- `git log`
- `git blame <file>`
