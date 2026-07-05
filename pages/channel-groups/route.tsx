import { preloadablePage } from "../preloadablePage";

const { Page: ChannelGroupsPage, preload: preloadChannelGroupsPage } = preloadablePage(() =>
  import("./ChannelGroupsPage").then((m) => ({
    default: m.ChannelGroupsPage,
  })),
);

export const channelGroupsRoute = {
  path: "/channel-groups",
  element: <ChannelGroupsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.channelGroups" },
  preload: preloadChannelGroupsPage,
};
