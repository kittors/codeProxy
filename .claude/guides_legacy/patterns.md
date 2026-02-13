# 常用模式与反模式（React 19 + TS）

本规范提供可复用的实现模式，避免重复踩坑。

## 1. 数据获取模式

### 1.1 页面加载（初次）

建议：

- 组件 mount 后触发 `refresh()`
- loading 与生命周期绑定
- 报错展示可重试

### 1.2 刷新与 UI 卡顿

当刷新会更新大量图表/列表时：

- 优先用 `useTransition` 把“状态更新”标记为低优先级（参考 `MonitorPage`）
- loading 仍由真实请求控制，不要和 `isPending` 混用

补充建议：

- 刷新按钮在 loading 时禁用，并保持按钮宽度稳定（避免文案切换导致抖动）
- 错误态不要覆盖数据（可保留上一次成功数据，并在页面显著位置提示“数据可能过期”）

## 2. 表单提交模式

规则：

- 先做本地校验（例如空值、格式）
- 再发请求
- 成功后 toast + 跳转或刷新
- 失败 toast（中文且不泄露敏感信息）

常见反模式：

- 提交时清空输入框导致用户无法修正
- 失败后把服务端返回原样展示（可能包含敏感信息）

## 3. 列表/配置编辑模式

当用户编辑一组 key/value 或 model 列表时：

- state 设计要能表达“新增/删除/禁用/排序”
- 展示侧保持稳定宽度，避免输入时布局抖动
- 数值/计数使用 `tabular-nums`

建议：

- 列表项的 `key` 必须稳定且与“身份”一致；不要用 `Math.random()` 或数组下标当 key（除非列表永不重排）
- 对“空列表”提供明确 EmptyState（参考 `src/modules/ui/EmptyState.tsx`）

## 4. Modal/Confirm 模式

优先复用：

- `src/modules/ui/Modal.tsx`
- `src/modules/ui/ConfirmModal.tsx`

原则：

- 确认型操作必须二次确认（尤其是删除/清空/覆盖）
- 关闭方式一致：Esc/点击遮罩/右上角关闭按钮（如组件支持）

## 5. 图表（ECharts）模式

使用 ECharts 时建议：

- 图表 option 用 `useMemo` 生成，依赖只包含必要数据（避免每次 render 都重建大对象）
- 主题适配通过 `useTheme()` 的 mode 决定（dark 时调整背景/文字/网格线）
- legend/筛选 state 设计为“显式 selected map”（参考 `MonitorPage`），避免在 option 里隐式推导

避免：

- 在渲染阶段创建大量匿名函数导致图表频繁重绘
- 把颜色常量散落在各组件（优先集中管理并复用）

## 6. 反模式（强烈避免）

- 为了刷新数据给容器加 `key` 强制 remount（会丢状态且造成闪烁）
- 在渲染中创建不稳定对象/函数导致子组件频繁重渲（用 `useMemo`/`useCallback`）
- 把 API 解析逻辑写在页面里（应放到 `apis.ts`）
