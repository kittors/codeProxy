<!--
  滑块：<Slider bind:value={volume} max={100} label="音量" />
  · value 用 bind:value 双向绑定（也可以只给 value + onchange 自己管）；bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createSlider } from "../src/components.js";

  let { max, label, value = $bindable(), onchange, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createSlider} options={{ max, label, value, onChange: (v) => { value = v; onchange?.(v); } }} bind:instance {...rest} />
