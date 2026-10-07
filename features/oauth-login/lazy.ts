import { lazy } from "react";

/**
 * The add-account dialog opens from one toolbar button, so its code (flows,
 * illustrations, imports) is split out of the AI accounts page chunk. The page
 * renders it closed inside Suspense, which starts the download right after the
 * page has loaded — the first open is still instant.
 */
export const LazyAddAccountDialog = lazy(() =>
  import("./components/AddAccountDialog").then((module) => ({ default: module.AddAccountDialog })),
);
