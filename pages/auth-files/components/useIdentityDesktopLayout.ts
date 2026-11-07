import { useEffect, useState } from "react";

const IDENTITY_DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

/**
 * 账号详情弹窗的「身份」页签按这个断点切换布局（从 AuthFileDetailModal 拆出来，那个文件卡在行数棘轮上）。
 */
export const useIdentityDesktopLayout = () => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(IDENTITY_DESKTOP_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(IDENTITY_DESKTOP_MEDIA_QUERY);
    const updateMatches = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(media.matches);
    media.addEventListener("change", updateMatches);
    return () => media.removeEventListener("change", updateMatches);
  }, []);

  return matches;
};
