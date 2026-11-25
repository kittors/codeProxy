<!--
  satin-ui/svelte/Satin.svelte：把任意 createXxx 包成 Svelte 组件的底子（Select、DatePicker、DataGrid 都是它套一层）。
    <Satin create={createChat} options={{ title: "助手", respond }} bind:instance />
  · create：createXxx；options：传给它的选项（变了调实例的 update）；bind:instance 拿到 Satin 实例（update / destroy / 各组件的方法）
  · 服务端渲染和浏览器第一帧一样的标记（createXxx.html），挂上以后再接交互；第一次挂载时 setup()（引用计数，卸载时撤掉）
  · 其余属性（id、data-*、aria-*、class、style）写在外面那层 display: contents 的壳上
-->
<script>
  import { onMount, untrack } from "svelte";
  import { setup } from "../src/setup.js";

  let { create, options = {}, instance = $bindable(null), class: className = "", style = "", ...rest } = $props();
  const clean = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));
  // 第一帧的标记只按创建时的选项生成一次，之后的变化都交给实例的 update
  const html = untrack(() => create.html?.(clean(options)) ?? "");
  let host;

  onMount(() => {
    const unsetup = setup();
    const inst = create(host.firstElementChild ?? host, clean(options));
    instance = inst;
    return () => { inst.destroy(); instance = null; unsetup(); };
  });
  // 选项变了（包括数组里的项）：交给实例，它自己判断要不要重画、要不要动画
  $effect(() => { const o = clean(options); instance?.update(o); });
</script>

<div bind:this={host} class={className ? `sn-host ${className}` : "sn-host"} style="display: contents;{style ? ` ${style}` : ""}" {...rest}>{@html html}</div>
