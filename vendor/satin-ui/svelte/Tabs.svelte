<!--
  标签页：<Tabs tabs={[{ label: "概览", content: "…" }]} bind:value={tab} />（value 是第几个，从 0 数）
  · value 用 bind:value 双向绑定（也可以只给 value + onchange 自己管）；bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createTabs } from "../src/components.js";

  let { tabs, value = $bindable(), onchange, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createTabs} options={{ tabs, value, onChange: (v) => { value = v; onchange?.(v); } }} bind:instance {...rest} />
