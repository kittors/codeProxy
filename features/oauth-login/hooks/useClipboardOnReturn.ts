import { useEffect, useRef, useState } from "react";

type ClipboardPermission = "granted" | "prompt" | "denied" | "unsupported";

async function readClipboardPermission(): Promise<ClipboardPermission> {
  try {
    if (!navigator.permissions?.query || !navigator.clipboard?.readText) return "unsupported";
    // Firefox and Safari do not know this permission name and throw.
    const status = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
    return status.state;
  } catch {
    return "unsupported";
  }
}

/**
 * When the operator comes back to this tab — usually straight after copying
 * the callback address in another one — read the clipboard if the browser
 * already allows it. Never triggers a permission prompt on its own: without the
 * permission it only reports `returned`, so the UI can point at the paste
 * button instead.
 */
export function useClipboardOnReturn(enabled: boolean, onText: (text: string) => void) {
  const [returned, setReturned] = useState(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    if (!enabled) {
      setReturned(false);
      return;
    }
    let disposed = false;
    let leftAt = 0;

    const onLeave = () => {
      if (document.visibilityState === "hidden") leftAt = Date.now();
    };
    const onReturn = async () => {
      if (document.visibilityState !== "visible" || !leftAt) return;
      leftAt = 0;
      setReturned(true);
      if ((await readClipboardPermission()) !== "granted") return;
      try {
        const text = await navigator.clipboard.readText();
        if (!disposed && text.trim()) onTextRef.current(text);
      } catch {
        // Focus moved again or the browser refused this read; the paste button still works.
      }
    };
    const onWindowBlur = () => {
      leftAt = Date.now();
    };
    const onWindowFocus = () => void onReturn();

    document.addEventListener("visibilitychange", onLeave);
    document.addEventListener("visibilitychange", onWindowFocus);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onLeave);
      document.removeEventListener("visibilitychange", onWindowFocus);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [enabled]);

  return { returned };
}
