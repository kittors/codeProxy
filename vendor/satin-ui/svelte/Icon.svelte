<!-- 图标：<Icon name="plus" />（satin-ui/icons 里的名字）。和 icon() 生成的 <svg class="sn-ic"> 一模一样，按钮里 .sn-btn > .sn-ic 这类样式照样命中 -->
<script>
  import { ICONS } from "../src/foundation/icons.js";

  let { name, size = 16, class: className = "" } = $props();
</script>

<svg class={className ? `sn-ic ${className}` : "sn-ic"} data-icon={name} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html ICONS[name] || ""}</svg>
