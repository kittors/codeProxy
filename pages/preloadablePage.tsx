import type { ComponentType, ReactElement } from "react";

type PageModule = {
  default: ComponentType;
};

export function preloadablePage(load: () => Promise<PageModule>): {
  Page: () => ReactElement;
  preload: () => Promise<PageModule>;
} {
  let loadedModule: PageModule | null = null;
  let loadingPromise: Promise<PageModule> | null = null;

  const preload = () => {
    loadingPromise ??= load().then((module) => {
      loadedModule = module;
      return module;
    });
    return loadingPromise;
  };

  const Page = () => {
    if (!loadedModule) {
      throw preload();
    }

    const LoadedPage = loadedModule.default;
    return <LoadedPage />;
  };

  return { Page, preload };
}
