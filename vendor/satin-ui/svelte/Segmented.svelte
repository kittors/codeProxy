<!--
  分段控件：<Segmented items={["网格", "列表"]} bind:value={view} label="视图" />
  · value 用 bind:value 双向绑定（也可以只给 value + onchange 自己管）；bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createSegmented } from "../src/components.js";

  let { items, size, label, value = $bindable(), onchange, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createSegmented} options={{ items, size, label, value, onChange: (v) => { value = v; onchange?.(v); } }} bind:instance {...rest} />
