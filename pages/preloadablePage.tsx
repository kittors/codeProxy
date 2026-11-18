import type { ComponentType, ReactElement } from "react";
import { recoverFromChunkLoadError } from "./chunkLoadRecovery";

type PageModule = {
  default: ComponentType;
};

type Preload = () => Promise<unknown>;

/** preload 函数 → 「布局挂载这个页面前要等什么」，见 pendingPageLoad。 */
const pendingLoads = new WeakMap<Preload, () => Promise<void> | null>();

export function preloadablePage(load: () => Promise<PageModule>): {
  Page: () => ReactElement;
  preload: () => Promise<PageModule>;
} {
  let loadedModule: PageModule | null = null;
  let loadingPromise: Promise<PageModule> | null = null;
  /** 本次加载结束（成功或失败）就兑现、从不 reject 的那份，给布局挂起用。 */
  let settledLoad: Promise<void> | null = null;
  let loadFailed = false;

  const preload = () => {
    if (!loadingPromise) {
      loadFailed = false;
      loadingPromise = load()
        .then((module) => {
          loadedModule = module;
          return module;
        })
        .catch((error: unknown) => {
          // Allow a later navigation or render to retry after deploy settles.
          loadingPromise = null;
          loadFailed = true;
          // Best-effort recovery when the shell is still mounted with a stale
          // import map (new release removed the hashed chunk this tab expects).
          recoverFromChunkLoadError(error);
          throw error;
        });
      settledLoad = loadingPromise.then(
        () => undefined,
        () => undefined,
      );
    }
    return loadingPromise;
  };

  const pendingLoad = () => {
    // 加载失败后不再拦：照旧渲染，由 Page 重新抛出加载，走原来的失败处理（硬刷新恢复 / 错误边界）。
    if (loadedModule || loadFailed) return null;
    void preload();
    return settledLoad;
  };
  pendingLoads.set(preload, pendingLoad);

  const Page = () => {
    if (!loadedModule) {
      throw preload();
    }

    const LoadedPage = loadedModule.default;
    return <LoadedPage />;
  };

  return { Page, preload };
}

/**
 * 页面代码还在加载时返回一个加载结束就兑现的 promise（供调用方抛出挂起），已加载、加载失败过，
 * 或 preload 不是 preloadablePage 生成的都返回 null。
 *
 * 用途见 DashboardLayout：页面切换动画在导航的 transition 之外才挂载新页面，那一刻页面再挂起
 * 会把整个外壳换成 Suspense 的空回退；布局在 transition 里先等页面代码，React 就保留旧页面。
 */
export function pendingPageLoad(preload: Preload | undefined): Promise<void> | null {
  if (!preload) return null;
  return pendingLoads.get(preload)?.() ?? null;
}
