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
 * - 代码块加载失败时交给 recoverFromChunkLoadError 硬刷新，而不是跳进一个空白的 Suspense；
 * - `pendingTo` 等新 location 真正提交了才清：React Router 7 的 BrowserRouter / HashRouter 用
 *   startTransition 提交 location，比普通 setState 晚一拍。navigate() 之后同步清掉的话，中间会按旧路径
 *   渲染一次，面包屑和侧边栏高亮闪回上一页（11-07 录屏第 188 帧）。
 */
export function useRouteNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingTo, setPendingTo] = useState("");
  const [progressDone, setProgressDone] = useState(false);
  const progressStartedAt = useRef(0);
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const navigationRequestId = useRef(0);
  /** 已经 navigate()、等新 location 提交的那次导航；0 表示没有。 */
  const awaitingCommit = useRef(0);

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
            awaitingCommit.current = requestId;
            navigate(to, { viewTransition: true });
            progressTimers.current = [];
          }, ROUTE_PROGRESS_HIDE_MS);
          progressTimers.current.push(navigateTimer);
        })
        .catch((error: unknown) => {
          if (navigationRequestId.current !== requestId) return;
          clearProgressTimers();
          setProgressDone(false);
          if (recoverFromChunkLoadError(error)) {
            setPendingTo("");
            return;
          }
          // Non-chunk failure: fall back to navigation so Suspense can surface
          // the error boundary on render rather than stranding the progress bar.
          awaitingCommit.current = requestId;
          navigate(to, { viewTransition: true });
        });
    },
    [clearProgressTimers, location.pathname, navigate],
  );

  // 新 location 提交后（这一帧已经按新路径渲染）再清 pendingTo 和进度条。等待期间又点了别的页，
  // 那次导航还在进行，pendingTo 留给它。
  useEffect(() => {
    const requestId = awaitingCommit.current;
    if (!requestId) return;
    awaitingCommit.current = 0;
    if (navigationRequestId.current !== requestId) return;
    setPendingTo("");
    setProgressDone(false);
  }, [location.key]);

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
