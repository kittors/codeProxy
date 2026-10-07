import { useEffect, useState } from "react";

/** 标签页是否在前台。后台时停掉轮询：没人看的监控页不该一直打后端。 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}
