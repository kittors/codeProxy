<!--
  标签输入：<TagInput bind:tags={tags} max={5} placeholder="输入后回车" />
  · tags 用 bind:tags 双向绑定（也可以只给 tags + onchange 自己管）；bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createTagInput } from "../src/components.js";

  let { max, placeholder, hint, tags = $bindable(), onchange, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createTagInput} options={{ max, placeholder, hint, tags, onChange: (v) => { tags = v; onchange?.(v); } }} bind:instance {...rest} />
