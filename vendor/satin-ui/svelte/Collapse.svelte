<!--
  折叠面板：<Collapse items={[{ title: "…", content: "…" }]} single bind:open={open} ontoggle={(e) => …} />
  · open 是展开的序号：bind:open 双向绑定（也可以只给 open 当初始值）；bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createCollapse } from "../src/components.js";

  let { items, single, open = $bindable(), ontoggle, onchange, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createCollapse} options={{ items, single, open, onToggle: (v) => ontoggle?.(v), onChange: (v) => { open = v; onchange?.(v); } }} bind:instance {...rest} />
