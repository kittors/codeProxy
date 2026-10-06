/**
 * Clipboard helpers that also work where the async Clipboard API does not.
 *
 * Browsers only expose navigator.clipboard on secure origins: HTTPS or
 * localhost. A panel served over plain HTTP on a LAN address or bare IP — a
 * common self-hosted setup — has no clipboard API at all, so copying falls back
 * to a hidden textarea, and reading is not offered (pressing ⌘V / Ctrl+V into
 * the field still works everywhere).
 */
export const canReadClipboard = () =>
  typeof window !== "undefined" &&
  window.isSecureContext !== false &&
  typeof navigator !== "undefined" &&
  typeof navigator.clipboard?.readText === "function";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
