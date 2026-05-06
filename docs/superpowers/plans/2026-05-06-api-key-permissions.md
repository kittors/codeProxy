# API Key 权限配置修正计划

## 目标

把「权限配置」从批量修改 API Key 的页面修正为可复用配置列表。API Key 弹窗只选择配置，配置本身包含权限、限额和系统提示词。

## 实施步骤

1. 新增 `api-key-permission-profiles` YAML 读写封装，定义配置结构和应用到 API Key 的纯函数。
2. 将 API Key 表单值增加 `permissionProfileId`，弹窗改为名称、Key、权限配置下拉。
3. 改造 `ApiKeyPermissionsPage`：使用 `VirtualTable` 展示配置列表，弹窗新增/编辑配置，保存时同步已绑定 API Key。
4. 更新 i18n、`AGENTS.md`、`docs/evolution.md` 和设计文档。
5. 更新测试：API Key 创建选择配置、配置列表新增保存、既有自定义配置保留。
6. 运行定向测试、全量测试、lint、build 和 bundle diff。

## 验证命令

```bash
bun run test src/modules/api-keys/__tests__/ApiKeysPage.test.tsx src/modules/api-key-permissions/__tests__/ApiKeyPermissionsPage.test.tsx
bun run test
bun run check
```
