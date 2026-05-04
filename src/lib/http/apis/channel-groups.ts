import { apiClient } from "@/lib/http/client";

export interface ChannelGroupItem {
  name: string;
  description?: string;
  priority?: number;
  implicit?: boolean;
  prefixes?: string[];
  channels?: string[];
  "allowed-models"?: string[];
  "path-routes"?: string[];
}

export const channelGroupsApi = {
  async list(): Promise<ChannelGroupItem[]> {
    const data = await apiClient.get<Record<string, unknown>>("/channel-groups");
    const items = data?.items;
    return Array.isArray(items) ? (items as ChannelGroupItem[]) : [];
  },
};
