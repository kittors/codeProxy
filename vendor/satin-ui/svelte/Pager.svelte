<!--
  分页：<Pager total={24} bind:page={page} />
  · page 用 bind:page 双向绑定（也可以只给 page + onchange 自己管）；bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createPager } from "../src/components.js";

  let { total, count, page = $bindable(), onchange, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createPager} options={{ total, count, page, onChange: (v) => { page = v; onchange?.(v); } }} bind:instance {...rest} />
