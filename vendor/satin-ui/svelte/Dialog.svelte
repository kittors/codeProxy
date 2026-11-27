<!--
  弹窗：<Dialog bind:open title="新建项目" description="名称之后随时可以改。">内容 {#snippet footer()}按钮{/snippet}</Dialog>
  · open 用 bind:open 双向绑定；关完（Esc、取消、程序关）发 onclose，open 同时改回 false
  · 取消按钮写 data-cancel、关闭按钮写 data-x：和 Esc 一样先走 guard 再关；guard(close) 拦下关闭（比如填了内容先在底栏问一句），确认要关时调 close()
  · onsubmit：表单提交（主按钮写 type="submit"，输入框里按回车也算），弹窗不会因为提交自己关，处理完把 open 改成 false
  · icon：标题左边的图标（危险确认用 trash-2）；footerClass 加在底栏上（比如两组按钮原地切换的 sn-two、sn-asking）；class 加在 <dialog> 上（sn-wide 宽 560）
-->
<script>
  import { onMount } from "svelte";
  import { setup } from "../src/setup.js";
  import { openDialog, closeDialog, wireDialog } from "../src/overlay/overlay.js";
  import Icon from "./Icon.svelte";

  let { open = $bindable(false), title, description, icon, guard, onclose, onsubmit, footerClass = "", draggable = true, class: className = "", children, footer, ...rest } = $props();
  const tid = $props.id();
  let el;

  onMount(() => {
    const unsetup = setup();
    wireDialog(el);
    el.guard = () => (guard ? guard(() => closeDialog(el)) : closeDialog(el));
    const closed = () => { open = false; onclose?.(); };
    el.addEventListener("close", closed);
    return () => { el.removeEventListener("close", closed); unsetup(); };
  });
  // 从触发按钮那里长出来（打开时焦点还在按钮上）；关上时原路缩回
  $effect(() => {
    if (open && !el.open) openDialog(el, document.activeElement);
    else if (!open && el.open) closeDialog(el);
  });
</script>

<dialog bind:this={el} class={className ? `sn-dlg ${className}` : "sn-dlg"} aria-labelledby={title ? tid : undefined} data-draggable={draggable === false ? "false" : undefined} {...rest}>
  <form method="dialog" {onsubmit}>
    {#if title || description || icon}
      <div class="sn-hd">
        {#if icon}<span class="sn-dlg-icon"><Icon name={icon} /></span>{/if}
        <div style="flex:1">
          {#if title}<h3 id={tid}>{title}</h3>{/if}
          {#if description}<div class="sn-sub">{description}</div>{/if}
        </div>
      </div>
    {/if}
    {#if children}<div class="sn-bd">{@render children()}</div>{/if}
    {#if footer}<div class={footerClass ? `sn-ft ${footerClass}` : "sn-ft"}>{@render footer()}</div>{/if}
  </form>
</dialog>
