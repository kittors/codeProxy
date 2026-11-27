<!--
  日期、时间、地址选择器：<DatePicker kind="range" onchange={(d) => (range = d.text)} />
  · kind：date（默认）| range | time | datetime | region；placeholder：还没选时触发框里的字；label：面板的读屏名称
  · onchange({ text })：选好、清除时；text 是触发框里显示的文字（清除时是空字符串）
  · today / now：固定"今天""现在"（测试、截图用）。kind、placeholder、label 只在创建时用：要换就套 {#key}
  · 没有 bind:value：选择器现在只能读出选中的结果，不能从外面设值
-->
<script>
  import Satin from "./Satin.svelte";
  import { createPicker } from "../src/components.js";

  let { kind = "date", placeholder, label, today, now, onchange, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createPicker} options={{ kind, placeholder, label, today, now, onChange: (d) => onchange?.(d) }} bind:instance {...rest} />
