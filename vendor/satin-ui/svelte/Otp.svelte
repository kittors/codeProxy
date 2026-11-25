<!--
  验证码：<Otp length={6} mask oncomplete={(code) => …} />
  · mask 开启密码隐藏（掩码模式）；reveal 控制是否显示眼睛显隐切换按钮（mask 开启时默认显示）
  · bind:instance 拿到 Satin 实例
-->
<script>
  import Satin from "./Satin.svelte";
  import { createOtp } from "../src/components.js";

  let { length, mask, reveal, oncomplete, instance = $bindable(null), ...rest } = $props();
</script>

<Satin create={createOtp} options={{ length, mask, reveal, onComplete: (v) => oncomplete?.(v) }} bind:instance {...rest} />
