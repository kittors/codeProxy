<!--
  头像：<Avatar name="林知远" size={24} decorative />
  · 有照片给 src（加载失败退回预设）；没有就按 name / seed 稳定地挑一张预设；旁边已经写了名字就加 decorative；bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createAvatar } from "../src/components.js";

  let { src, name, seed, size, label, decorative, online, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createAvatar} options={{ src, name, seed, size, label, decorative, online }} bind:instance {...rest} />
