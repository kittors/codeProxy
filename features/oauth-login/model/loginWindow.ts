/**
 * Opening the provider's page from the click that starts a login.
 *
 * The authorization URL only exists after the start request returns, and a
 * window opened after an await is no longer tied to the click, so popup
 * blockers stop it. The tab is therefore opened blank inside the click and
 * pointed at the URL once it arrives. `opener` is cut first so the provider's
 * page cannot reach back into the panel.
 */
export function openPendingWindow(): Window | null {
  try {
    const pending = window.open("about:blank", "_blank");
    if (pending) pending.opener = null;
    return pending ?? null;
  } catch {
    return null;
  }
}

/** Points a pending tab at the URL; false when it was blocked or closed meanwhile. */
export function navigatePendingWindow(pending: Window | null, url: string): boolean {
  if (!pending || pending.closed) return false;
  try {
    pending.location.href = url;
    return true;
  } catch {
    return false;
  }
}

export function openInNewTab(url: string) {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // Blocked: the link stays on screen to click or copy.
  }
}
