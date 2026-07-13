import type { ComponentType, ReactElement } from "react";
import { recoverFromChunkLoadError } from "./chunkLoadRecovery";

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
    if (!loadingPromise) {
      loadingPromise = load()
        .then((module) => {
          loadedModule = module;
          return module;
        })
        .catch((error: unknown) => {
          // Allow a later navigation or render to retry after deploy settles.
          loadingPromise = null;
          // Best-effort recovery when the shell is still mounted with a stale
          // import map (new release removed the hashed chunk this tab expects).
          recoverFromChunkLoadError(error);
          throw error;
        });
    }
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
