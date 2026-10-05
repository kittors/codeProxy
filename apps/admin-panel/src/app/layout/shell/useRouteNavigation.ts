import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { preloadPageRoute } from "@pages/registry";
import { recoverFromChunkLoadError } from "@pages/chunkLoadRecovery";
import { shouldUseNativeNavigation } from "./navModel";

const ROUTE_PROGRESS_MIN_MS = 680;
const ROUTE_PROGRESS_HIDE_MS = 360;

/**
 * 侧边栏导航：先预加载目标页的代码块，同时在窗口顶端跑一条进度条，加载完再切路由。
 *
 * - `pendingTo` 让点击的那一项立刻高亮，不必等懒加载和路由更新；
 * - 进度条至少跑 680ms、收尾 360ms，快网络下也不会一闪而过；
 * - 连续点击以最后一次为准（requestId），旧请求的回调全部作废；
 * - 代码块加载失败时交给 recoverFromChunkLoadError 硬刷新，而不是跳进一个空白的 Suspense。
 */
export function useRouteNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingTo, setPendingTo] = useState("");
  const [progressDone, setProgressDone] = useState(false);
  const progressStartedAt = useRef(0);
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const navigationRequestId = useRef(0);

  const clearProgressTimers = useCallback(() => {
    progressTimers.current.forEach(clearTimeout);
    progressTimers.current = [];
  }, []);

  const warmPageRoute = useCallback((to: string) => {
    // Hover warm-up: ignore failures; click path handles chunk recovery.
    void preloadPageRoute(to).catch(() => undefined);
  }, []);

  const startNavigation = useCallback(
    (to: string) => {
      if (to === location.pathname) return;

      const requestId = navigationRequestId.current + 1;
      navigationRequestId.current = requestId;
      clearProgressTimers();
      progressStartedAt.current = Date.now();
      setProgressDone(false);
      setPendingTo(to);

      const minimumProgress = new Promise<void>((resolve) => {
        const delay = Math.max(0, ROUTE_PROGRESS_MIN_MS - (Date.now() - progressStartedAt.current));
        const timer = setTimeout(resolve, delay);
        progressTimers.current.push(timer);
      });

      // Do not swallow chunk-load failures: stale post-deploy assets must hard-reload
      // instead of navigating into an empty Suspense tree.
      void Promise.all([preloadPageRoute(to), minimumProgress])
        .then(() => {
          if (navigationRequestId.current !== requestId) return;
          setProgressDone(true);

          const navigateTimer = setTimeout(() => {
            if (navigationRequestId.current !== requestId) return;
            navigate(to, { viewTransition: true });
            setPendingTo("");
            setProgressDone(false);
            progressTimers.current = [];
          }, ROUTE_PROGRESS_HIDE_MS);
          progressTimers.current.push(navigateTimer);
        })
        .catch((error: unknown) => {
          if (navigationRequestId.current !== requestId) return;
          clearProgressTimers();
          setPendingTo("");
          setProgressDone(false);
          if (recoverFromChunkLoadError(error)) return;
          // Non-chunk failure: fall back to navigation so Suspense can surface
          // the error boundary on render rather than stranding the progress bar.
          navigate(to, { viewTransition: true });
        });
    },
    [clearProgressTimers, location.pathname, navigate],
  );

  /** 链接点击：修饰键/中键交给浏览器；`afterSelect` 用来立刻收起手机抽屉或浮层。 */
  const handleNavClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, to: string, afterSelect?: () => void) => {
      if (shouldUseNativeNavigation(event)) return;
      afterSelect?.();
      if (to === location.pathname) return;
      event.preventDefault();
      startNavigation(to);
    },
    [location.pathname, startNavigation],
  );

  useEffect(
    () => () => {
      navigationRequestId.current += 1;
      clearProgressTimers();
    },
    [clearProgressTimers],
  );

  return { pendingTo, progressDone, startNavigation, handleNavClick, warmPageRoute };
}

export type RouteNavigation = ReturnType<typeof useRouteNavigation>;
