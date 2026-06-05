import { lazy } from "react";

const ChannelGroupsPage = lazy(() =>
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
};
