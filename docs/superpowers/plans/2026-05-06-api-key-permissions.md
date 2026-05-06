# API Key 权限配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「权限配置」菜单页，让用户批量维护 API Key 的模型、渠道分组和精确渠道权限，同时简化 API Key 编辑弹窗。

**Architecture:** 将 API Key 权限选项加载逻辑从 `ApiKeysPage` 抽到共享 hook；`ApiKeysPage` 继续负责密钥生命周期和基础字段；新 `ApiKeyPermissionsPage` 负责多选 API Key 与批量保存权限字段。路由和侧边栏使用现有 lazy page + `NAV_ITEMS` 模式。

**Tech Stack:** React 19.2、React Router 7、Vitest、Testing Library、Tailwind CSS、现有 `apiKeyEntriesApi` 和 UI primitives。

---

### Task 1: 文档与任务清单

**Files:**

- Create: `docs/superpowers/specs/2026-05-06-api-key-permissions-design.md`
- Create: `docs/superpowers/plans/2026-05-06-api-key-permissions.md`
- Create: `.helloagents/plan/2026-05-06--api-key-permissions/tasks.md`

- [ ] **Step 1: 保存设计文档和计划**

Run: `git status --short`

Expected: 看到上述三个新增文件。

- [ ] **Step 2: 提交文档**

```bash
git add docs/superpowers/specs/2026-05-06-api-key-permissions-design.md docs/superpowers/plans/2026-05-06-api-key-permissions.md .helloagents/plan/2026-05-06--api-key-permissions/tasks.md
git commit -m "docs: plan api key permissions page"
```

Expected: commit 成功。

### Task 2: 写失败测试

**Files:**

- Modify: `src/app/AppRouter.test.ts`
- Modify: `src/modules/ui/__tests__/AppShell.test.ts`
- Modify: `src/modules/api-keys/__tests__/ApiKeysPage.test.tsx`
- Create: `src/modules/api-key-permissions/__tests__/ApiKeyPermissionsPage.test.tsx`

- [ ] **Step 1: AppRouter 测试新增路由断言**

在 `src/app/AppRouter.test.ts` 中断言 `ApiKeyPermissionsPage` lazy import、`/api-key-permissions` 路由和 `/manage/api-key-permissions` redirect。

Run: `bun run test src/app/AppRouter.test.ts`

Expected: FAIL，原因是路由和页面尚不存在。

- [ ] **Step 2: AppShell 测试新增菜单断言**

在 `src/modules/ui/__tests__/AppShell.test.ts` 中断言 `nav_api_key_permissions` 和 `/api-key-permissions`。

Run: `bun run test src/modules/ui/__tests__/AppShell.test.ts`

Expected: FAIL，原因是菜单尚不存在。

- [ ] **Step 3: ApiKeysPage 测试编辑弹窗简化**

在 `src/modules/api-keys/__tests__/ApiKeysPage.test.tsx` 中新增测试：打开编辑弹窗后不出现 `Allowed channel groups`、`Allowed channels`、`Allowed models`。

Run: `bun run test src/modules/api-keys/__tests__/ApiKeysPage.test.tsx`

Expected: FAIL，原因是权限字段仍在编辑弹窗里。

- [ ] **Step 4: 新页面测试批量保存**

创建 `src/modules/api-key-permissions/__tests__/ApiKeyPermissionsPage.test.tsx`，mock `apiKeyEntriesApi`、`providersApi`、`authFilesApi`、`channelGroupsApi` 和 `apiClient.get`，断言：

- 页面标题为 `API Key 权限配置`
- 勾选两个 API Key
- 选择渠道分组 `pro`
- 开启精确渠道并选择 `Claude渠道`
- 选择模型 `claude-sonnet-4-5`
- 点击保存后 `apiKeyEntriesApi.replace` 收到两个条目，且只更新权限字段

Run: `bun run test src/modules/api-key-permissions/__tests__/ApiKeyPermissionsPage.test.tsx`

Expected: FAIL，原因是页面文件尚不存在。

### Task 3: 抽共享权限选项 hook

**Files:**

- Create: `src/modules/api-keys/hooks/useApiKeyPermissionOptions.tsx`
- Modify: `src/modules/api-keys/ApiKeysPage.tsx`

- [ ] **Step 1: 实现 hook**

从 `ApiKeysPage` 移出 `fetchModelOptions`、`loadModels`、`loadChannels`、`loadChannelGroups` 所需逻辑，输出：

```ts
{
  availableModels,
  availableChannels,
  availableChannelGroups,
  channelGroupItems,
  channelRouteGroupsByName,
  channelGroupByName,
  fetchModelOptions,
  loadModels,
  loadChannels,
  loadChannelGroups,
  refreshPermissionOptions,
}
```

- [ ] **Step 2: ApiKeysPage 使用 hook**

删除页面内重复 state 和 loader，把现有使用点改成 hook 返回值。

- [ ] **Step 3: 跑现有 API Keys 测试**

Run: `bun run test src/modules/api-keys/__tests__/ApiKeysPage.test.tsx`

Expected: 只剩“编辑弹窗简化”测试失败，已有行为测试通过。

### Task 4: 简化 API Key 表单

**Files:**

- Modify: `src/modules/api-keys/components/ApiKeyFormFields.tsx`
- Modify: `src/modules/api-keys/components/ApiKeyFormModal.tsx`
- Modify: `src/modules/api-keys/ApiKeysPage.tsx`
- Modify: `src/modules/api-keys/types.ts`

- [ ] **Step 1: 移除权限字段渲染**

从 `ApiKeyFormFields` 移除渠道分组、精确渠道和模型选择器，只保留基础信息、限额和系统提示词。

- [ ] **Step 2: 保留创建/编辑时的数据兼容**

`ApiKeysPage` 创建时仍允许默认无限制；编辑保存时不覆盖原条目的权限字段，避免用户在基础编辑弹窗中误清权限。

- [ ] **Step 3: 验证 API Keys 页面测试**

Run: `bun run test src/modules/api-keys/__tests__/ApiKeysPage.test.tsx`

Expected: PASS。

### Task 5: 实现「权限配置」页面

**Files:**

- Create: `src/modules/api-key-permissions/ApiKeyPermissionsPage.tsx`
- Create: `src/modules/api-key-permissions/__tests__/ApiKeyPermissionsPage.test.tsx`

- [ ] **Step 1: 页面结构**

页面使用 `Card`、`VirtualTable`、`Checkbox`、`RestrictionMultiSelect`、`ToggleSwitch`、`Button`。左侧展示 API Key 列表和勾选框；右侧展示权限编辑器。

- [ ] **Step 2: 单选填充权限**

选中一个 API Key 时，将该条目的三类权限填入草稿。

- [ ] **Step 3: 多选批量覆盖**

选中多个 API Key 后，保存时只更新所选条目的 `allowed-channel-groups`、`allowed-channels`、`allowed-models`。

- [ ] **Step 4: 验证新页面测试**

Run: `bun run test src/modules/api-key-permissions/__tests__/ApiKeyPermissionsPage.test.tsx`

Expected: PASS。

### Task 6: 路由、菜单与文案

**Files:**

- Modify: `src/app/AppRouter.tsx`
- Modify: `src/modules/ui/AppShell.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `AGENTS.md`
- Modify: `docs/evolution.md`

- [ ] **Step 1: 新增 lazy route**

`AppRouter` 增加 `ApiKeyPermissionsPage` lazy import，路由 `/api-key-permissions` 和兼容 redirect `/manage/api-key-permissions`。

- [ ] **Step 2: 侧边栏新增菜单**

在 API Keys 后加入 `权限配置` 菜单，图标使用 `ShieldCheck` 或同类 lucide 图标。

- [ ] **Step 3: 新增中英文文案**

新增 `shell.nav_api_key_permissions`、`shell.page_api_key_permissions`、`api_key_permissions_page.*`。

- [ ] **Step 4: 更新项目索引和演进记录**

`AGENTS.md` 关键路径新增权限配置页面；`docs/evolution.md` 记录新增独立权限页面的原因、影响范围和回滚方式。

- [ ] **Step 5: 验证路由和菜单测试**

Run:

```bash
bun run test src/app/AppRouter.test.ts src/modules/ui/__tests__/AppShell.test.ts
```

Expected: PASS。

### Task 7: 全量验证、提交和合并

**Files:**

- All modified files

- [ ] **Step 1: 格式化**

Run: `bun run format`

Expected: PASS，格式化完成。

- [ ] **Step 2: 格式化检查**

Run: `bunx oxfmt . --check`

Expected: PASS。

- [ ] **Step 3: 单元测试**

Run: `bun run test`

Expected: PASS。

- [ ] **Step 4: lint**

Run: `bun run lint`

Expected: PASS。

- [ ] **Step 5: 构建**

Run: `bun run build`

Expected: PASS。

- [ ] **Step 6: 提交并推送功能分支**

```bash
git add .
git commit -m "feat: add api key permissions page"
git push -u origin feature/api-key-permissions
```

Expected: 功能分支推送成功。

- [ ] **Step 7: 合并回 dev**

按仓库流程创建 PR 并合并回 `dev`，确认 `origin/dev` 包含本次提交。

Expected: `origin/dev` 包含功能分支提交，不改动 `main`。
