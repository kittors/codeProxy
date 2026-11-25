# satin-ui/svelte

Svelte 5 的组件。直接发 `.svelte` 源码（库没有构建步骤），项目里的 `@sveltejs/vite-plugin-svelte` 会编译 `node_modules` 里的 `.svelte`，SvelteKit、Vite + Svelte 都不用额外配置。要求 Svelte 5.20 以上（用到 `$props.id()`）。

## 入口里调一次

```js
// src/main.js
import { mount } from "svelte";
import { setup } from "satin-ui";
import { defineElements } from "satin-ui/elements";
import "satin-ui/css/page.css";
import App from "./App.svelte";

setup();          // 页面级行为：Tooltip、浮层栈、Esc 关闭、主题
defineElements(); // <sn-segmented>、<sn-tabs> 这些自定义元素（没有 Svelte 封装的组件直接写它们）
mount(App, { target: document.getElementById("app") });
```

组件第一次挂载时也会自己 `setup()`（引用计数），忘了调也能用。

## 组件

一个一个引（不做总的索引：没用到的组件不会被载进来）：

```svelte
<script>
  import Select from "satin-ui/svelte/Select.svelte";
  import DatePicker from "satin-ui/svelte/DatePicker.svelte";
  import Dialog from "satin-ui/svelte/Dialog.svelte";
  import Icon from "satin-ui/svelte/Icon.svelte";
  import DataGrid from "satin-ui/svelte/DataGrid.svelte"; // 重组件：引了才载 satin-ui/grid

  let ratio = $state("16:9 · 横屏"), open = $state(false);
</script>

<Select items={["16:9 · 横屏", "9:16 · 竖屏"]} bind:value={ratio} label="画面比例" />
<DatePicker kind="range" onchange={(d) => console.log(d.text)} />
<button type="button" class="sn-btn sn-primary" onclick={() => (open = true)}><Icon name="plus" />新建项目</button>
<Dialog bind:open title="新建项目" description="名称之后随时可以改。">
  …
  {#snippet footer()}
    <button type="button" class="sn-btn sn-ghost" data-cancel>取消</button>
    <button type="submit" class="sn-btn sn-primary">创建项目</button>
  {/snippet}
</Dialog>
<DataGrid rows={100000} seed={11} />
```

| 组件 | 属性 | 事件 / 绑定 |
| --- | --- | --- |
| `Select.svelte` | `items`、`value`、`placeholder`、`label` | `bind:value`；`onchange(value)` |
| `DatePicker.svelte` | `kind`（`date` / `range` / `time` / `datetime` / `region`）、`placeholder`、`label`、`today`、`now` | `onchange({ text })`（没有 `bind:value`：现在只能读出选中的结果） |
| `Dialog.svelte` | `open`、`title`、`description`、`icon`、`guard(close)`、`footerClass`、`class`；默认内容、`footer` 片段 | `bind:open`；`onclose()`、`onsubmit(e)` |
| `DataGrid.svelte` | `rows`、`seed`、`label`（只在创建时用，变了换一张新表） | — |
| `Icon.svelte` | `name`、`size`、`class` | — |
| `Satin.svelte` | `create`（任何 `createXxx`）、`options` | `bind:instance` |

每个有交互的组件都能 `bind:instance` 拿到 Satin 实例（`update` / `destroy` / 各组件的方法）。

## 不用封装的

- 按钮、输入框、字段、芯片这类纯样式的组件：直接写类名，`<button type="button" class="sn-btn sn-primary">`；图标用 `<Icon name>`。
- 等待 → 成功：按钮里写好 `.sn-label` 结构，`bind:this` 拿到按钮，调 `busy(按钮, 请求)`、`succeed(按钮)`（`satin-ui`）。
- 分段控件、滑块、标签页、分页这些有自定义元素的：写 `<sn-segmented items='["网格","列表"]' value="网格" onsn-change={(e) => …}>`。
- 其余照设计稿写好的一段标记（菜单、浮层触发器、折叠面板……）：包一层 `<sn-enhance>`，放进页面自动接上交互、移出页面自动撤掉。
- 别的 `createXxx`（对话、Markdown、流程图……）：`<Satin create={createChat} options={{ … }} bind:instance />`。
