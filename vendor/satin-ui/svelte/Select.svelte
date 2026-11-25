<!--
  下拉选择：<Select items={["16:9 · 横屏", "9:16 · 竖屏"]} bind:value={ratio} label="画面比例" />
  · items：字符串，或者 { value, label, disabled }；value 用 bind:value 双向绑定（也可以只给 value + onchange 自己管）
  · placeholder：还没选时显示的字；label：触发器的读屏名称
  · onchange(value)：选中一项时（程序里改 value 不触发）；bind:instance 拿到 Satin 实例（open()、close()）
-->
<script>
  import Satin from "./Satin.svelte";
  import { createSelect } from "../src/components.js";

  let { items = [], value = $bindable(), placeholder, label, onchange, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createSelect} options={{ items, value, placeholder, label, onChange: (v) => { value = v; onchange?.(v); } }} bind:instance {...rest} />
