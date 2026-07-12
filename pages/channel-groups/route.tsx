import { preloadablePage } from "../preloadablePage";

const { Page: ChannelGroupsPage, preload: preloadChannelGroupsPage } = preloadablePage(() =>
  import("./ChannelGroupsPage").then((m) => ({
    default: m.ChannelGroupsPage,
  })),
);

export const channelGroupsRoute = {
  path: "/models/channel-groups",
  component: "channel-groups",
  element: <ChannelGroupsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.channelGroups" },
  redirects: [{ from: "/channel-groups", to: "/models/channel-groups" }],
  requiredPermission: "routing.read",
  preload: preloadChannelGroupsPage,
};
