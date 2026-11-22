import { preloadablePage } from "../preloadablePage";

const { Page, preload } = preloadablePage(() =>
  import("./PublicPayPage").then((m) => ({ default: m.PublicPayPage })),
);

export const publicPayRoute = {
  path: "/pay/:code",
  element: <Page />,
  auth: false,
  layout: "none",
  nav: null,
  preload,
};
