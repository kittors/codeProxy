<!--
  步进器：<Stepper bind:value={count} min={1} max={10} unit="集" label="集数" />
  · value 用 bind:value 双向绑定（也可以只给 value + onchange 自己管）；bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createStepper } from "../src/components.js";

  let { min, max, unit, label, value = $bindable(), onchange, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createStepper} options={{ min, max, unit, label, value, onChange: (v) => { value = v; onchange?.(v); } }} bind:instance {...rest} />
