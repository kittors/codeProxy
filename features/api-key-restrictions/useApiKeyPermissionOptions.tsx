import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient, routingVirtualModelsApi } from "@code-proxy/api-client";
import { authFilesApi, providersApi } from "@code-proxy/api-client";
import {
  channelGroupsApi,
  type ChannelGroupItem,
} from "@code-proxy/api-client/endpoints/channel-groups";
import { VendorIcon } from "@code-proxy/assets";
import type { AuthFileItem } from "@code-proxy/api-client";
import type { MultiSelectOption } from "@code-proxy/ui";

const normalizeChannelKey = (value: string) => value.trim().toLowerCase();

/** 选项前面的来源小标签：渠道的 API / OAuth，模型的「虚拟」。 */
const SOURCE_TAG =
  "inline-flex rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-2xs font-medium text-ink-2 dark:bg-white/[0.07]";

/**
 * 租户的虚拟模型名：Key 要在允许模型里写上它才能请求，但 /models 只列真实模型，所以另读一次。
 * groups 不为空时只留至少有一个成员能用的：成员的分组得在 groups 里，没写分组的成员跟着请求
 * 本来的路由走。旧后端没有这个接口、或者角色读不了路由配置时，当作没有虚拟模型。
 */
async function fetchVirtualModelNames(groups: string[]): Promise<string[]> {
  try {
    const { virtualModels } = await routingVirtualModelsApi.get();
    const allowed = new Set(groups);
    return virtualModels
      .filter(
        (vm) =>
          allowed.size === 0 ||
          vm.members.some((member) => {
            const group = member.group?.trim().toLowerCase();
            return !group || allowed.has(group);
          }),
      )
      .map((vm) => vm.name.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const readAuthFileChannelName = (file: AuthFileItem): string => {
  const candidates = [file.label, file.email, file.provider, file.type];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
};

export function useApiKeyPermissionOptions() {
  const [availableModels, setAvailableModels] = useState<MultiSelectOption[]>([]);
  const [availableChannels, setAvailableChannels] = useState<MultiSelectOption[]>([]);
  const [availableChannelGroups, setAvailableChannelGroups] = useState<MultiSelectOption[]>([]);
  const [channelGroupItems, setChannelGroupItems] = useState<ChannelGroupItem[]>([]);
  const [channelRouteGroupsByName, setChannelRouteGroupsByName] = useState<
    Record<string, string[]>
  >({});
  const [channelGroupByName, setChannelGroupByName] = useState<Record<string, string>>({});

  const { t } = useTranslation();
  const virtualTag = t("api_keys_page.virtual_model_tag");
  const fetchModelOptions = useCallback(
    async (channels?: string[], groups?: string[]) => {
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
      const [models, virtualModels] = await Promise.all([
        apiClient
          .get<{ data?: Array<{ id?: string }> }>(`/models${qs}`)
          .then((data) => (data?.data ?? []).map((m) => m.id ?? "").filter(Boolean))
          // 模型列表只是权限配置的辅助信息，失败时不阻断页面。
          .catch(() => [] as string[]),
        fetchVirtualModelNames(normalizedGroups),
      ]);
      const options = new Map<string, MultiSelectOption>();
      models.forEach((id) =>
        options.set(id, { value: id, label: id, icon: <VendorIcon modelId={id} size={14} /> }),
      );
      // 和真实模型同名的虚拟模型（给那个模型加回退）只列一次，标成虚拟：请求按它的成员走。
      virtualModels.forEach((name) =>
        options.set(name, {
          value: name,
          label: name,
          icon: <span className={SOURCE_TAG}>{virtualTag}</span>,
        }),
      );
      return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
    },
    [virtualTag],
  );

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
      const [
        geminiKeys,
        claudeKeys,
        codexKeys,
        openCodeGoKeys,
        clineKeys,
        ollamaCloudKeys,
        commandCodeKeys,
        vertexKeys,
        openaiProviders,
        authFiles,
      ] = await Promise.all([
        providersApi.getGeminiKeys().catch(() => []),
        providersApi.getClaudeConfigs().catch(() => []),
        providersApi.getCodexConfigs().catch(() => []),
        providersApi.getOpenCodeGoConfigs().catch(() => []),
        providersApi.getClineConfigs().catch(() => []),
        providersApi.getOllamaCloudConfigs().catch(() => []),
        providersApi.getCommandCodeConfigs().catch(() => []),
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
          icon: <span className={SOURCE_TAG}>{source}</span>,
        });
      };

      geminiKeys.forEach((item) => push(item.name || "", "API", "gemini"));
      claudeKeys.forEach((item) => push(item.name || "", "API", "claude"));
      codexKeys.forEach((item) => push(item.name || "", "API", "codex"));
      openCodeGoKeys.forEach((item) => push(item.name || "", "API", "opencode-go"));
      clineKeys.forEach((item) => push(item.name || "", "API", "cline"));
      ollamaCloudKeys.forEach((item) => push(item.name || "", "API", "ollama-cloud"));
      commandCodeKeys.forEach((item) => push(item.name || "", "API", "commandcode"));
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
