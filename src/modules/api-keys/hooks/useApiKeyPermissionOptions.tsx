import { useCallback, useState } from "react";
import { apiClient } from "@/lib/http/client";
import { authFilesApi, providersApi } from "@/lib/http/apis";
import { channelGroupsApi, type ChannelGroupItem } from "@/lib/http/apis/channel-groups";
import {
  normalizeChannelKey,
  readAuthFileChannelName,
  VendorIcon,
} from "@/modules/api-keys/apiKeyPageUtils";
import type { MultiSelectOption } from "@/modules/ui/MultiSelect";

export function useApiKeyPermissionOptions() {
  const [availableModels, setAvailableModels] = useState<MultiSelectOption[]>([]);
  const [availableChannels, setAvailableChannels] = useState<MultiSelectOption[]>([]);
  const [availableChannelGroups, setAvailableChannelGroups] = useState<MultiSelectOption[]>([]);
  const [channelGroupItems, setChannelGroupItems] = useState<ChannelGroupItem[]>([]);
  const [channelRouteGroupsByName, setChannelRouteGroupsByName] = useState<
    Record<string, string[]>
  >({});
  const [channelGroupByName, setChannelGroupByName] = useState<Record<string, string>>({});

  const fetchModelOptions = useCallback(async (channels?: string[], groups?: string[]) => {
    try {
      const normalizedChannels = (Array.isArray(channels) ? channels : [])
        .map((c) => String(c ?? "").trim())
        .filter(Boolean);
      const normalizedGroups = (Array.isArray(groups) ? groups : [])
        .map((group) =>
          String(group ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
      const params = new URLSearchParams();
      if (normalizedChannels.length > 0) {
        params.set("allowed_channels", normalizedChannels.join(","));
      }
      if (normalizedGroups.length > 0) {
        params.set("allowed_channel_groups", normalizedGroups.join(","));
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await apiClient.get<{ data?: Array<{ id?: string }> }>(`/models${qs}`);
      if (data?.data) {
        return data.data
          .filter((m) => m.id)
          .map((m) => ({
            value: m.id!,
            label: m.id!,
            icon: <VendorIcon modelId={m.id!} size={14} />,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
      }
    } catch {
      // 模型列表只是权限配置的辅助信息，失败时不阻断页面。
    }
    return [] as MultiSelectOption[];
  }, []);

  const loadModels = useCallback(
    async (channels?: string[], groups?: string[]) => {
      const opts = await fetchModelOptions(channels, groups);
      if (opts.length > 0) {
        setAvailableModels(opts);
      }
      return opts;
    },
    [fetchModelOptions],
  );

  const loadChannelGroups = useCallback(async () => {
    try {
      const groups = await channelGroupsApi.list();
      setChannelGroupItems(groups);
      const options: MultiSelectOption[] = groups
        .map((group) => ({
          value: String(group.name ?? "")
            .trim()
            .toLowerCase(),
          label: String(group.name ?? "")
            .trim()
            .toLowerCase(),
          description:
            typeof group.description === "string" && group.description.trim()
              ? group.description.trim()
              : undefined,
        }))
        .filter((option) => option.value)
        .sort((a, b) => a.label.localeCompare(b.label));
      setAvailableChannelGroups(options);

      const nextMembership: Record<string, string[]> = {};
      groups.forEach((group: ChannelGroupItem) => {
        const groupName = String(group.name ?? "")
          .trim()
          .toLowerCase();
        if (!groupName) return;
        const channels = Array.isArray(group.channels) ? group.channels : [];
        channels.forEach((channel) => {
          const name = String(channel ?? "").trim();
          if (!name) return;
          const existing = nextMembership[name] ?? [];
          if (!existing.includes(groupName)) {
            nextMembership[name] = [...existing, groupName];
          }
        });
      });
      Object.keys(nextMembership).forEach((name) => {
        nextMembership[name] = [...nextMembership[name]].sort((a, b) => a.localeCompare(b));
      });
      setChannelRouteGroupsByName(nextMembership);
    } catch {
      // 权限页可在没有渠道分组列表时继续显示 API Key。
    }
  }, []);

  const loadChannels = useCallback(async () => {
    try {
      const [geminiKeys, claudeKeys, codexKeys, vertexKeys, openaiProviders, authFiles] =
        await Promise.all([
          providersApi.getGeminiKeys().catch(() => []),
          providersApi.getClaudeConfigs().catch(() => []),
          providersApi.getCodexConfigs().catch(() => []),
          providersApi.getVertexConfigs().catch(() => []),
          providersApi.getOpenAIProviders().catch(() => []),
          authFilesApi.list().catch(() => ({ files: [] })),
        ]);

      const seen = new Set<string>();
      const options: MultiSelectOption[] = [];
      const nextGroupByName: Record<string, string> = {};
      const push = (rawName: string, source: string, groupKey: string) => {
        const name = String(rawName ?? "").trim();
        const key = normalizeChannelKey(name);
        if (!key || seen.has(key)) return;
        seen.add(key);
        nextGroupByName[name] = groupKey;
        options.push({
          value: name,
          label: name,
          icon: (
            <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-neutral-800 dark:text-white/60">
              {source}
            </span>
          ),
        });
      };

      geminiKeys.forEach((item) => push(item.name || "", "API", "gemini"));
      claudeKeys.forEach((item) => push(item.name || "", "API", "claude"));
      codexKeys.forEach((item) => push(item.name || "", "API", "codex"));
      vertexKeys.forEach((item) => push(item.name || "", "API", "vertex"));
      openaiProviders.forEach((item) => push(item.name || "", "API", "openai"));
      (authFiles.files || []).forEach((file) => {
        if (
          String(file.account_type || "")
            .trim()
            .toLowerCase() !== "oauth"
        )
          return;
        const groupKey = String(file.type || file.provider || "")
          .trim()
          .toLowerCase();
        push(readAuthFileChannelName(file), "OAuth", groupKey);
      });

      options.sort((a, b) => a.label.localeCompare(b.label));
      setAvailableChannels(options);
      setChannelGroupByName(nextGroupByName);
    } catch {
      // 渠道列表只是权限选择辅助，失败时保留空选项。
    }
  }, []);

  const refreshPermissionOptions = useCallback(async () => {
    await Promise.all([loadModels(), loadChannels(), loadChannelGroups()]);
  }, [loadChannelGroups, loadChannels, loadModels]);

  return {
    availableModels,
    availableChannels,
    availableChannelGroups,
    channelGroupItems,
    channelRouteGroupsByName,
    channelGroupByName,
    fetchModelOptions,
    loadModels,
    loadChannels,
    loadChannelGroups,
    refreshPermissionOptions,
  };
}
