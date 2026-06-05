# Feature Module Template

适用于复杂页面或复杂业务域模块。

```text
pages/<feature>/
  <Feature>Page.tsx
  components/
    <Feature>Header.tsx
    <Feature>Table.tsx
    <Feature>Filters.tsx
    <Feature>Dialogs.tsx
  hooks/
    use<Feature>Data.ts
    use<Feature>Filters.ts
  helpers/
    formatters.ts
    mappers.ts
    validators.ts
  constants.ts
  types.ts
  __tests__/
    <Feature>Page.test.tsx
    use<Feature>Data.test.ts
    validators.test.ts
```

## 使用约束

- `<Feature>Page.tsx` 只保留页面装配和顶层数据流。
- `components/` 不直接发请求。
- `hooks/` 管理请求、缓存、轮询、分页、筛选。
- `helpers/` 保持纯函数，方便单测。
- `types.ts` 只放当前 feature 私有类型。
- 运行期 API 类型优先复用 `@code-proxy/api-client` 导出的后端契约类型。
- 跨页面 UI/流程能力进入 `features/<capability>/`；纯业务 normalize/format/validator 进入 `packages/domain`。
