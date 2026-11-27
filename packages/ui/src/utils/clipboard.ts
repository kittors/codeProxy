export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.opacity = "0";
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    // 原生 <dialog>.showModal() 打开时，document.body 下兄弟节点会被浏览器标为 modal inert，
    // 导致临时 textarea 无法聚焦/选中、execCommand("copy") 静默失败；优先挂到最顶层打开的 <dialog> 内。
    const openDialogs = document.querySelectorAll("dialog[open]");
    const host = openDialogs.length > 0 ? openDialogs[openDialogs.length - 1] : document.body;
    host.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}
