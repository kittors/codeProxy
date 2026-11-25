<!--
  数字滚动：<NumberFlow value={count} effect="roll" />（value 变了数字滚过去；effect 是变化的样子：roll / blur / push / fade）
  · bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createNumberFlow } from "../src/components.js";

  let { value, effect, format, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createNumberFlow} options={{ value, effect, format }} bind:instance {...rest} />
