import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Copy,
  Pencil,
  Trash2,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Infinity as InfinityIcon,
  BarChart3,
  Power,
  Info,
} from "lucide-react";
import { apiKeyEntriesApi, apiKeysApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { authFilesApi, providersApi, usageApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import { apiClient } from "@/lib/http/client";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";
import { Modal } from "@/modules/ui/Modal";
import { HoverTooltip, OverflowTooltip } from "@/modules/ui/Tooltip";
import type { MultiSelectOption } from "@/modules/ui/MultiSelect";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";
import { ApiKeyFormModal } from "@/modules/api-keys/components/ApiKeyFormModal";
import { ApiKeyUsageModal } from "@/modules/api-keys/components/ApiKeyUsageModal";
import { LogContentModal } from "@/modules/monitor/LogContentModal";
import { ErrorDetailModal } from "@/modules/monitor/ErrorDetailModal";
import {
  buildRequestLogsColumns,
  DEFAULT_REQUEST_LOG_PAGE_SIZE,
  toRequestLogsRow,
  type RequestLogsRow,
  type TimeRange,
} from "@/modules/monitor/requestLogsShared";
import type { ApiKeyFormValues } from "@/modules/api-keys/types";

// Vendor SVG icons
import iconClaude from "@/assets/icons/claude.svg";
import iconOpenai from "@/assets/icons/openai.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import iconDeepseek from "@/assets/icons/deepseek.svg";
import iconQwen from "@/assets/icons/qwen.svg";
import iconMinimax from "@/assets/icons/minimax.svg";
import iconGrok from "@/assets/icons/grok.svg";
import iconKimiLight from "@/assets/icons/kimi-light.svg";
import iconKimiDark from "@/assets/icons/kimi-dark.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGlm from "@/assets/icons/glm.svg";
import iconKiro from "@/assets/icons/kiro.svg";
import iconVertex from "@/assets/icons/vertex.svg";
import iconIflow from "@/assets/icons/iflow.svg";

/* ─── vendor icon helpers ─── */

const VENDOR_ICONS: Record<string, { light: string; dark: string }> = {
  claude: { light: iconClaude, dark: iconClaude },
  gpt: { light: iconOpenai, dark: iconOpenai },
  o1: { light: iconOpenai, dark: iconOpenai },
  o3: { light: iconOpenai, dark: iconOpenai },
  o4: { light: iconOpenai, dark: iconOpenai },
  gemini: { light: iconGemini, dark: iconGemini },
  deepseek: { light: iconDeepseek, dark: iconDeepseek },
  qwen: { light: iconQwen, dark: iconQwen },
  minimax: { light: iconMinimax, dark: iconMinimax },
  grok: { light: iconGrok, dark: iconGrok },
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  codex: { light: iconCodex, dark: iconCodex },
  glm: { light: iconGlm, dark: iconGlm },
  kiro: { light: iconKiro, dark: iconKiro },
  vertex: { light: iconVertex, dark: iconVertex },
  iflow: { light: iconIflow, dark: iconIflow },
};

function VendorIcon({ modelId, size = 14 }: { modelId: string; size?: number }) {
  const lower = modelId.toLowerCase();
  let icons: { light: string; dark: string } | null = null;
  for (const prefix of Object.keys(VENDOR_ICONS)) {
    if (lower.startsWith(prefix)) {
      icons = VENDOR_ICONS[prefix];
      break;
    }
  }
  if (!icons) return null;
  return (
    <>
      <img src={icons.light} alt="" width={size} height={size} className="dark:hidden" />
      <img src={icons.dark} alt="" width={size} height={size} className="hidden dark:block" />
    </>
  );
}

/* ─── helpers ─── */

const generateKey = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "sk-";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

const maskKey = (key: string) => {
  if (key.length <= 8) return key;
  return key.slice(0, 5) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-3);
};

const formatDate = (iso: string | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const formatLimit = (limit: number | undefined) => {
  if (!limit || limit <= 0) return null;
  return limit.toLocaleString();
};

/* ─── usage detail row type ─── */

type StatusFilter = "" | "success" | "failed";

const normalizeChannelKey = (value: string) => value.trim().toLowerCase();

const readAuthFileChannelName = (file: AuthFileItem): string => {
  const candidates = [file.label, file.email, file.provider, file.type];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
};

const CHANNEL_GROUP_LABELS: Record<string, string> = {
  gemini: "Gemini",
  claude: "Claude",
  codex: "Codex",
  vertex: "Vertex",
  openai: "OpenAI Compatible",
  "gemini-cli": "Gemini CLI",
  antigravity: "Antigravity",
  kimi: "Kimi",
  qwen: "Qwen",
  iflow: "iFlow",
  kiro: "Kiro",
};

const normalizeChannelGroupKey = (value: string): string => value.trim().toLowerCase();

const resolveChannelGroupLabel = (value: string): string => {
  const key = normalizeChannelGroupKey(value);
  return CHANNEL_GROUP_LABELS[key] || value;
};

/* ─── component ─── */

export function ApiKeysPage() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteLogsOnDelete, setDeleteLogsOnDelete] = useState(true);
  const [usageViewKey, setUsageViewKey] = useState<string | null>(null);
  const [usageViewName, setUsageViewName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<MultiSelectOption[]>([]);
  const [availableChannels, setAvailableChannels] = useState<MultiSelectOption[]>([]);
  const [channelGroupByName, setChannelGroupByName] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ApiKeyFormValues>({
    name: "",
    key: "",
    dailyLimit: "",
    totalQuota: "",
    concurrencyLimit: "",
    rpmLimit: "",
    tpmLimit: "",
    allowedModels: [],
    allowedChannels: [],
    systemPrompt: "",
  });
  const [usageRawItems, setUsageRawItems] = useState<import("@/lib/http/apis/usage").UsageLogItem[]>(
    [],
  );
  const [usageTotalCount, setUsageTotalCount] = useState(0);
  const [usageCurrentPage, setUsageCurrentPage] = useState(1);
  const [usagePageSize, setUsagePageSize] = useState(DEFAULT_REQUEST_LOG_PAGE_SIZE);
  const [usageLastUpdatedAt, setUsageLastUpdatedAt] = useState<number | null>(null);
  const [usageFilterOptions, setUsageFilterOptions] = useState<{
    channels: string[];
    models: string[];
  }>({ channels: [], models: [] });
  const usageFilterOptionsRef = useRef<{ channels: string[]; models: string[] }>({
    channels: [],
    models: [],
  });
  const [usageTimeRange, setUsageTimeRange] = useState<TimeRange>(7);
  const [usageChannelQuery, setUsageChannelQuery] = useState("");
  const [usageChannelGroupQuery, setUsageChannelGroupQuery] = useState("");
  const [usageModelQuery, setUsageModelQuery] = useState("");
  const [usageStatusFilter, setUsageStatusFilter] = useState<StatusFilter>("");
  const [usageContentModalOpen, setUsageContentModalOpen] = useState(false);
  const [usageContentModalLogId, setUsageContentModalLogId] = useState<number | null>(null);
  const [usageContentModalTab, setUsageContentModalTab] = useState<"input" | "output">("input");
  const [usageErrorModalOpen, setUsageErrorModalOpen] = useState(false);
  const [usageErrorModalLogId, setUsageErrorModalLogId] = useState<number | null>(null);
  const [usageErrorModalModel, setUsageErrorModalModel] = useState("");
  const usageFetchInFlightRef = useRef(false);

  /* ─── load models ─── */

  const loadModels = useCallback(async (channels?: string[]) => {
    try {
      const raw = Array.isArray(channels) ? channels : [];
      const normalized = raw.map((c) => String(c ?? "").trim()).filter(Boolean);
      const qs =
        normalized.length > 0
          ? `?allowed_channels=${encodeURIComponent(normalized.join(","))}`
          : "";
      const data = await apiClient.get<{ data?: Array<{ id?: string }> }>(`/models${qs}`);
      if (data?.data) {
        const opts: MultiSelectOption[] = data.data
          .filter((m) => m.id)
          .map((m) => ({
            value: m.id!,
            label: m.id!,
            icon: <VendorIcon modelId={m.id!} size={14} />,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setAvailableModels(opts);
        const allowedSet = new Set(opts.map((o) => o.value));
        setForm((p) => ({
          ...p,
          allowedModels: p.allowedModels.filter((m) => allowedSet.has(m)),
        }));
      }
    } catch {
      // silent — models list is supplementary
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
      // silent — channel list is supplementary
    }
  }, []);

  /* ─── load ─── */

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesData, legacyKeys] = await Promise.all([
        apiKeyEntriesApi.list(),
        apiKeysApi.list().catch(() => [] as string[]),
      ]);

      // Auto-migrate: old api-keys not in api-key-entries get added as unnamed entries
      const entryKeySet = new Set(entriesData.map((e) => e.key));
      const newEntries = legacyKeys
        .filter((k: string) => k && !entryKeySet.has(k))
        .map((k: string): ApiKeyEntry => ({ key: k, "created-at": new Date().toISOString() }));

      let finalEntries: ApiKeyEntry[];
      if (newEntries.length > 0) {
        const merged = [...entriesData, ...newEntries];
        try {
          await apiKeyEntriesApi.replace(merged);
          notify({
            type: "success",
            message: t("api_keys_page.auto_import", { count: newEntries.length }),
          });
        } catch {
          // silent
        }
        finalEntries = merged;
      } else {
        finalEntries = entriesData;
      }
      setEntries(finalEntries);
      // Load models after entries are available (needs a valid API key)
      void loadModels();
      void loadChannels();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, loadChannels, loadModels]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  /* ─── toggle disable ─── */

  const handleToggleDisable = async (index: number) => {
    const entry = entries[index];
    const updated = { ...entry, disabled: !entry.disabled };
    const newEntries = [...entries];
    newEntries[index] = updated;

    try {
      await apiKeyEntriesApi.replace(newEntries);
      setEntries(newEntries);
      notify({
        type: "success",
        message: updated.disabled
          ? t("api_keys_page.disabled_toast", { name: entry.name || t("api_keys_page.unnamed") })
          : t("api_keys_page.enabled_toast", { name: entry.name || t("api_keys_page.unnamed") }),
      });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.operation_failed"),
      });
    }
  };

  /* ─── create ─── */

  const handleOpenCreate = () => {
    const next = {
      name: "",
      key: generateKey(),
      dailyLimit: "",
      totalQuota: "",
      concurrencyLimit: "",
      rpmLimit: "",
      tpmLimit: "",
      allowedModels: [],
      allowedChannels: [],
      systemPrompt: "",
    };
    setForm(next);
    void loadModels(next.allowedChannels);
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      notify({ type: "error", message: t("api_keys_page.name_required") });
      return;
    }
    if (!form.key.trim()) {
      notify({ type: "error", message: t("api_keys_page.key_empty") });
      return;
    }
    setSaving(true);
    try {
      const newEntry: ApiKeyEntry = {
        key: form.key.trim(),
        name: form.name.trim(),
        "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : undefined,
        "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : undefined,
        "concurrency-limit": form.concurrencyLimit
          ? parseInt(form.concurrencyLimit, 10) || 0
          : undefined,
        "rpm-limit": form.rpmLimit ? parseInt(form.rpmLimit, 10) || 0 : undefined,
        "tpm-limit": form.tpmLimit ? parseInt(form.tpmLimit, 10) || 0 : undefined,
        "allowed-models": form.allowedModels.length > 0 ? form.allowedModels : undefined,
        "allowed-channels": form.allowedChannels.length > 0 ? form.allowedChannels : undefined,
        "system-prompt": form.systemPrompt.trim() || undefined,
        "created-at": new Date().toISOString(),
      };
      await apiKeyEntriesApi.replace([...entries, newEntry]);
      notify({ type: "success", message: t("api_keys_page.created_success") });
      setShowCreate(false);
      await loadEntries();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.create_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  /* ─── edit ─── */

  const handleOpenEdit = (index: number) => {
    const entry = entries[index];
    const next = {
      name: entry.name || "",
      key: entry.key,
      dailyLimit: entry["daily-limit"]?.toString() || "",
      totalQuota: entry["total-quota"]?.toString() || "",
      concurrencyLimit: entry["concurrency-limit"]?.toString() || "",
      rpmLimit: entry["rpm-limit"]?.toString() || "",
      tpmLimit: entry["tpm-limit"]?.toString() || "",
      allowedModels: entry["allowed-models"] || [],
      allowedChannels: entry["allowed-channels"] || [],
      systemPrompt: entry["system-prompt"] || "",
    };
    setForm(next);
    void loadModels(next.allowedChannels);
    setEditIndex(index);
  };

  const handleEdit = async () => {
    if (editIndex === null) return;
    if (!form.name.trim()) {
      notify({ type: "error", message: t("api_keys_page.name_required") });
      return;
    }
    const originalKey = entries[editIndex].key;
    const newKey = form.key.trim();
    setSaving(true);
    try {
      await apiKeyEntriesApi.update({
        index: editIndex,
        value: {
          ...(newKey !== originalKey ? { key: newKey } : {}),
          name: form.name.trim(),
          "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : 0,
          "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : 0,
          "concurrency-limit": form.concurrencyLimit ? parseInt(form.concurrencyLimit, 10) || 0 : 0,
          "rpm-limit": form.rpmLimit ? parseInt(form.rpmLimit, 10) || 0 : 0,
          "tpm-limit": form.tpmLimit ? parseInt(form.tpmLimit, 10) || 0 : 0,
          "allowed-models": form.allowedModels.length > 0 ? form.allowedModels : [],
          "allowed-channels": form.allowedChannels.length > 0 ? form.allowedChannels : [],
          "system-prompt": form.systemPrompt.trim(),
        },
      });
      notify({ type: "success", message: t("api_keys_page.updated_success") });
      setEditIndex(null);
      await loadEntries();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.update_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  /* ─── delete ─── */

  const handleDelete = async () => {
    if (deleteIndex === null) return;
    setSaving(true);
    try {
      const response = (await apiKeyEntriesApi.delete({
        index: deleteIndex,
        deleteLogs: deleteLogsOnDelete,
      })) as { logs_deleted?: number } | undefined;
      const logsDeleted =
        typeof response?.logs_deleted === "number" ? response.logs_deleted : undefined;
      notify({
        type: "success",
        message:
          deleteLogsOnDelete && typeof logsDeleted === "number"
            ? t("api_keys_page.deleted_success_with_logs", { count: logsDeleted })
            : t("api_keys_page.deleted_success"),
      });
      setDeleteIndex(null);
      setDeleteLogsOnDelete(true);
      await loadEntries();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.delete_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDelete = (index: number) => {
    setDeleteLogsOnDelete(true);
    setDeleteIndex(index);
  };

  /* ─── copy ─── */

  const handleCopy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      notify({ type: "success", message: t("api_keys_page.copied_toast") });
    } catch {
      notify({ type: "error", message: t("api_keys_page.copy_failed") });
    }
  };

  /* ─── usage view ─── */

  const handleUsageContentClick = useCallback((logId: number, tab: "input" | "output") => {
    setUsageContentModalLogId(logId);
    setUsageContentModalTab(tab);
    setUsageContentModalOpen(true);
  }, []);

  const handleUsageErrorClick = useCallback((logId: number, model: string) => {
    setUsageErrorModalLogId(logId);
    setUsageErrorModalModel(model);
    setUsageErrorModalOpen(true);
  }, []);

  const usageLogColumns = useMemo(
    () => buildRequestLogsColumns(t, handleUsageContentClick, handleUsageErrorClick),
    [t, handleUsageContentClick, handleUsageErrorClick],
  );

  const usageRows = useMemo<RequestLogsRow[]>(
    () => (usageRawItems ?? []).map((item) => toRequestLogsRow(item)),
    [usageRawItems],
  );

  const usageTotalPages = Math.max(1, Math.ceil(usageTotalCount / usagePageSize));

  const buildUsageChannelQuery = useCallback(
    (channelName: string, groupKey: string) => {
      const trimmedChannel = channelName.trim();
      const normalizedGroup = normalizeChannelGroupKey(groupKey);

      if (trimmedChannel) {
        if (!normalizedGroup) return trimmedChannel;
        const mappedGroup = channelGroupByName[trimmedChannel];
        return mappedGroup === normalizedGroup ? trimmedChannel : "__no_match__";
      }

      if (!normalizedGroup) return "";
      const matchedChannels = usageFilterOptionsRef.current.channels.filter(
        (channel) => channelGroupByName[channel] === normalizedGroup,
      );
      return matchedChannels.length > 0 ? matchedChannels.join(",") : "__no_match__";
    },
    [channelGroupByName],
  );

  const fetchUsageLogs = useCallback(
    async (page: number, size: number) => {
      if (!usageViewKey || usageFetchInFlightRef.current) return;
      usageFetchInFlightRef.current = true;
      setUsageLoading(true);

      try {
        const channelQuery = buildUsageChannelQuery(usageChannelQuery, usageChannelGroupQuery);
        const result = await usageApi.getUsageLogs({
          page,
          size,
          days: usageTimeRange,
          api_key: usageViewKey,
          model: usageModelQuery || undefined,
          channel: channelQuery || undefined,
          status: usageStatusFilter || undefined,
        });

        setUsageRawItems(result.items ?? []);
        setUsageTotalCount(result.total ?? 0);
        setUsageCurrentPage(page);
        setUsageFilterOptions({
          channels: Array.isArray(result.filters?.channels) ? result.filters.channels : [],
          models: Array.isArray(result.filters?.models) ? result.filters.models : [],
        });
        setUsageLastUpdatedAt(Date.now());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("api_keys_page.load_usage_failed"),
        });
      } finally {
        usageFetchInFlightRef.current = false;
        setUsageLoading(false);
      }
    },
    [
      buildUsageChannelQuery,
      notify,
      t,
      usageChannelGroupQuery,
      usageChannelQuery,
      usageModelQuery,
      usageStatusFilter,
      usageTimeRange,
      usageViewKey,
    ],
  );

  const resetUsageViewState = useCallback(() => {
    setUsageRawItems([]);
    setUsageTotalCount(0);
    setUsageCurrentPage(1);
    setUsagePageSize(DEFAULT_REQUEST_LOG_PAGE_SIZE);
    setUsageLastUpdatedAt(null);
    setUsageFilterOptions({ channels: [], models: [] });
    setUsageTimeRange(7);
    setUsageChannelQuery("");
    setUsageChannelGroupQuery("");
    setUsageModelQuery("");
    setUsageStatusFilter("");
  }, []);

  const handleViewUsage = useCallback(
    async (entry: ApiKeyEntry) => {
      resetUsageViewState();
      setUsageViewKey(entry.key);
      setUsageViewName(entry.name || t("api_keys_page.unnamed"));
    },
    [resetUsageViewState, t],
  );

  /* ─── column definitions ─── */

  const apiKeyColumns = useMemo<VirtualTableColumn<ApiKeyEntry>[]>(
    () => [
      {
        key: "status",
        label: t("api_keys_page.col_status"),
        width: "w-[88px] min-w-[88px]",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row, idx) => (
          <button
            onClick={() => void handleToggleDisable(idx)}
            title={
              row.disabled ? t("api_keys_page.click_enable") : t("api_keys_page.click_disable")
            }
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              row.disabled
                ? "text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-white/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                : "text-emerald-500 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            }`}
          >
            <Power size={15} />
          </button>
        ),
      },
      {
        key: "name",
        label: t("api_keys_page.col_name"),
        width: "w-[120px] min-w-[120px]",
        cellClassName: "font-medium",
        render: (row) => (
          <OverflowTooltip
            content={row.name || t("api_keys_page.unnamed")}
            className="block min-w-0"
          >
            <span className="block min-w-0 truncate">
              {row.name || (
                <span className="text-slate-400 dark:text-white/40">
                  {t("common.unnamed", "Unnamed")}
                </span>
              )}
            </span>
          </OverflowTooltip>
        ),
      },
      {
        key: "key",
        label: t("api_keys_page.col_key"),
        width: "w-[240px] min-w-[240px]",
        cellClassName: "whitespace-nowrap",
        render: (row) => (
          <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-neutral-800 dark:text-white/70">
            {maskKey(row.key)}
          </code>
        ),
      },
      {
        key: "dailyLimit",
        label: t("api_keys_page.col_daily_limit"),
        width: "w-[132px] min-w-[132px]",
        cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
        render: (row) => (
          <span className="inline-flex items-center gap-1">
            {!row["daily-limit"] ? (
              <>
                <InfinityIcon size={14} className="text-green-500" />{" "}
                {t("api_keys_page.unlimited")}
              </>
            ) : (
              formatLimit(row["daily-limit"])
            )}
          </span>
        ),
      },
      {
        key: "totalQuota",
        label: t("api_keys_page.col_total_quota"),
        width: "w-[132px] min-w-[132px]",
        cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
        render: (row) => (
          <span className="inline-flex items-center gap-1">
            {!row["total-quota"] ? (
              <>
                <InfinityIcon size={14} className="text-green-500" />{" "}
                {t("api_keys_page.unlimited")}
              </>
            ) : (
              formatLimit(row["total-quota"])
            )}
          </span>
        ),
      },
      {
        key: "rpmLimit",
        label: "RPM",
        width: "w-[108px] min-w-[108px]",
        cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
        headerRender: () => (
          <HoverTooltip content={t("api_keys.rpm_full")} className="inline-flex items-center gap-1">
            <span>{t("api_keys_page.rpm")}</span>
            <Info size={12} className="text-slate-400 dark:text-white/40" />
          </HoverTooltip>
        ),
        render: (row) => (
          <span className="inline-flex items-center gap-1">
            {!row["rpm-limit"] ? (
              <>
                <InfinityIcon size={14} className="text-green-500" />{" "}
                {t("api_keys_page.unlimited")}
              </>
            ) : (
              formatLimit(row["rpm-limit"])
            )}
          </span>
        ),
      },
      {
        key: "tpmLimit",
        label: "TPM",
        width: "w-[108px] min-w-[108px]",
        cellClassName: "whitespace-nowrap text-slate-700 dark:text-white/70",
        headerRender: () => (
          <HoverTooltip content={t("api_keys.tpm_full")} className="inline-flex items-center gap-1">
            <span>{t("api_keys_page.tpm")}</span>
            <Info size={12} className="text-slate-400 dark:text-white/40" />
          </HoverTooltip>
        ),
        render: (row) => (
          <span className="inline-flex items-center gap-1">
            {!row["tpm-limit"] ? (
              <>
                <InfinityIcon size={14} className="text-green-500" />{" "}
                {t("api_keys_page.unlimited")}
              </>
            ) : (
              formatLimit(row["tpm-limit"])
            )}
          </span>
        ),
      },
      {
        key: "allowedModels",
        label: t("api_keys_page.col_models"),
        width: "w-[150px] min-w-[150px]",
        cellClassName: "text-slate-700 dark:text-white/70 overflow-hidden min-w-0",
        render: (row) =>
          row["allowed-models"]?.length ? (
            <HoverTooltip
              content={
                <div className="flex flex-wrap gap-1.5 max-w-xs">
                  {row["allowed-models"].map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:border-neutral-700/40 dark:bg-neutral-800/60 dark:text-white/80"
                    >
                      <VendorIcon modelId={m} size={12} />
                      {m}
                    </span>
                  ))}
                </div>
              }
              className="block min-w-0"
            >
              <span className="inline-flex items-center gap-1.5 text-xs min-w-0 w-full">
                <span className="inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-md bg-indigo-50 px-1.5 font-semibold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                  {row["allowed-models"].length}
                </span>
                <span className="block min-w-0 flex-1 truncate text-slate-500 dark:text-white/50">
                  {row["allowed-models"][0]}
                </span>
              </span>
            </HoverTooltip>
          ) : (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-green-600 dark:text-green-400">
              <ShieldCheck size={14} /> {t("api_keys_page.all_models")}
            </span>
          ),
      },
      {
        key: "allowedChannels",
        label: t("api_keys_page.col_channels"),
        width: "w-[172px] min-w-[172px]",
        cellClassName: "text-slate-700 dark:text-white/70 overflow-hidden min-w-0",
        render: (row) =>
          row["allowed-channels"]?.length ? (
            <HoverTooltip
              content={
                <div className="flex max-w-xs flex-wrap gap-1.5">
                  {row["allowed-channels"].map((channel) => (
                    <span
                      key={channel}
                      className="inline-flex items-center rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:border-neutral-700/40 dark:bg-neutral-800/60 dark:text-white/80"
                    >
                      {channel}
                    </span>
                  ))}
                </div>
              }
              className="block min-w-0"
            >
              <span className="inline-flex min-w-0 w-full items-center gap-1.5 text-xs">
                <span className="inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-md bg-cyan-50 px-1.5 font-semibold tabular-nums text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                  {row["allowed-channels"].length}
                </span>
                <span className="block min-w-0 flex-1 truncate text-slate-500 dark:text-white/50">
                  {row["allowed-channels"][0]}
                </span>
              </span>
            </HoverTooltip>
          ) : (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-green-600 dark:text-green-400">
              <ShieldCheck size={14} /> {t("api_keys_page.all_channels")}
            </span>
          ),
      },
      {
        key: "createdAt",
        label: t("api_keys_page.col_created"),
        width: "w-[168px] min-w-[168px]",
        cellClassName: "whitespace-nowrap text-slate-500 dark:text-white/50",
        render: (row) => <>{formatDate(row["created-at"])}</>,
      },
      {
        key: "actions",
        label: t("api_keys_page.col_actions"),
        width: "w-[152px] min-w-[152px]",
        render: (row, idx) => (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleViewUsage(row)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-blue-400"
              title={t("api_keys_page.view_usage")}
            >
              <BarChart3 size={15} />
            </button>
            <button
              onClick={() => void handleCopy(row.key)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
              title={t("api_keys_page.copy_key")}
            >
              <Copy size={15} />
            </button>
            <button
              onClick={() => handleOpenEdit(idx)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-amber-400"
              title={t("common.edit")}
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => handleOpenDelete(idx)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-white/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              title={t("common.delete")}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ),
      },
    ],
    [handleToggleDisable, handleViewUsage, handleCopy, handleOpenEdit, handleOpenDelete, t],
  );

  const usageChannelOptions = useMemo(() => {
    return [
      { value: "", label: t("request_logs.all_channels") },
      ...usageFilterOptions.channels.map((channel) => ({ value: channel, label: channel })),
    ];
  }, [t, usageFilterOptions.channels]);

  const usageChannelGroupOptions = useMemo(() => {
    const seen = new Set<string>();
    const values: { value: string; label: string }[] = [];
    usageFilterOptions.channels.forEach((channel) => {
      const groupKey = channelGroupByName[channel];
      if (!groupKey || seen.has(groupKey)) return;
      seen.add(groupKey);
      values.push({ value: groupKey, label: resolveChannelGroupLabel(groupKey) });
    });
    values.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "", label: t("api_keys_page.all_channel_groups") }, ...values];
  }, [channelGroupByName, t, usageFilterOptions.channels]);

  const usageModelOptions = useMemo(() => {
    return [
      { value: "", label: t("request_logs.all_models") },
      ...usageFilterOptions.models.map((model) => ({ value: model, label: model })),
    ];
  }, [t, usageFilterOptions.models]);

  const usageLastUpdatedText = useMemo(() => {
    if (usageLoading) return t("request_logs.refreshing");
    if (!usageLastUpdatedAt) return t("request_logs.not_refreshed");
    return t("request_logs.updated_at", {
      time: new Date(usageLastUpdatedAt).toLocaleTimeString(),
    });
  }, [t, usageLastUpdatedAt, usageLoading]);

  useEffect(() => {
    usageFilterOptionsRef.current = usageFilterOptions;
  }, [usageFilterOptions]);

  useEffect(() => {
    if (!usageViewKey) return;
    void fetchUsageLogs(1, usagePageSize);
  }, [
    fetchUsageLogs,
    usageChannelGroupQuery,
    usageChannelQuery,
    usageModelQuery,
    usagePageSize,
    usageStatusFilter,
    usageTimeRange,
    usageViewKey,
  ]);

  const closeUsageModal = useCallback(() => {
    setUsageViewKey(null);
    setUsageViewName("");
    resetUsageViewState();
  }, [resetUsageViewState]);

  /* ─── main render ─── */

  return (
    <div className="space-y-6">
      <Card
        title={t("api_keys_page.title")}
        description={t("api_keys_page.description")}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadEntries()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("api_keys_page.refresh")}
            </Button>
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus size={14} />
              {t("api_keys_page.create_key")}
            </Button>
          </div>
        }
        loading={loading}
      >
        {entries.length === 0 ? (
          <EmptyState
            title={t("api_keys_page.no_keys")}
            description={t("api_keys_page.no_keys_desc")}
            icon={<KeyRound size={32} className="text-slate-400" />}
          />
        ) : (
          <VirtualTable<ApiKeyEntry>
            rows={entries}
            columns={apiKeyColumns}
            rowKey={(row) => row.key}
            rowHeight={44}
            height="h-auto max-h-[70vh]"
            minWidth="min-w-[1560px]"
            caption={t("api_keys_page.table_caption")}
            emptyText={t("api_keys_page.no_api_keys")}
            rowClassName={(row) => (row.disabled ? "opacity-50" : "")}
          />
        )}
      </Card>

      <ApiKeyFormModal
        t={t}
        open={showCreate}
        editMode={false}
        saving={saving}
        form={form}
        setForm={setForm}
        availableChannels={availableChannels}
        availableModels={availableModels}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        regenerateKey={() => setForm((prev) => ({ ...prev, key: generateKey() }))}
      />

      <ApiKeyFormModal
        t={t}
        open={editIndex !== null}
        editMode
        saving={saving}
        form={form}
        setForm={setForm}
        availableChannels={availableChannels}
        availableModels={availableModels}
        onClose={() => setEditIndex(null)}
        onSubmit={handleEdit}
        regenerateKey={() => setForm((prev) => ({ ...prev, key: generateKey() }))}
      />

      {/* Delete Confirm */}
      <Modal
        open={deleteIndex !== null}
        onClose={() => {
          setDeleteIndex(null);
          setDeleteLogsOnDelete(true);
        }}
        title={t("api_keys_page.confirm_delete")}
        description={t("api_keys_page.delete_warning")}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteIndex(null);
                setDeleteLogsOnDelete(true);
              }}
            >
              {t("api_keys_page.cancel")}
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} disabled={saving}>
              {saving ? t("api_keys_page.deleting") : t("api_keys_page.confirm_delete_btn")}
            </Button>
          </>
        }
      >
        {deleteIndex !== null && entries[deleteIndex] && (
          <div className="space-y-3">
            <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
              <div className="text-sm font-medium text-red-800 dark:text-red-300">
                {entries[deleteIndex].name || t("api_keys_page.unnamed")}
              </div>
              <code className="text-xs text-red-600 dark:text-red-400">
                {maskKey(entries[deleteIndex].key)}
              </code>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-700 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-white/75">
              <input
                type="checkbox"
                checked={deleteLogsOnDelete}
                onChange={(event) => setDeleteLogsOnDelete(event.currentTarget.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-400/30 dark:border-neutral-700 dark:bg-neutral-950"
              />
              <span>{t("api_keys_page.delete_logs_option")}</span>
            </label>
          </div>
        )}
      </Modal>

      <ApiKeyUsageModal
        open={usageViewKey !== null}
        onClose={closeUsageModal}
        usageViewName={usageViewName}
        maskedKey={usageViewKey ? maskKey(usageViewKey) : ""}
        usageTotalCount={usageTotalCount}
        usageTimeRange={usageTimeRange}
        setUsageTimeRange={setUsageTimeRange}
        fetchUsageLogs={fetchUsageLogs}
        usagePageSize={usagePageSize}
        usageLoading={usageLoading}
        usageLastUpdatedText={usageLastUpdatedText}
        usageChannelGroupQuery={usageChannelGroupQuery}
        setUsageChannelGroupQuery={setUsageChannelGroupQuery}
        setUsageChannelQuery={setUsageChannelQuery}
        usageChannelGroupOptions={usageChannelGroupOptions}
        usageChannelQuery={usageChannelQuery}
        setUsageChannelQueryDirect={setUsageChannelQuery}
        usageChannelOptions={usageChannelOptions}
        usageModelQuery={usageModelQuery}
        setUsageModelQuery={setUsageModelQuery}
        usageModelOptions={usageModelOptions}
        usageStatusFilter={usageStatusFilter}
        setUsageStatusFilter={setUsageStatusFilter}
        usageLogColumns={usageLogColumns}
        usageRows={usageRows}
        usageCurrentPage={usageCurrentPage}
        usageTotalPages={usageTotalPages}
        setUsagePageSize={setUsagePageSize}
      />

      <LogContentModal
        open={usageContentModalOpen}
        logId={usageContentModalLogId}
        initialTab={usageContentModalTab}
        onClose={() => setUsageContentModalOpen(false)}
      />
      <ErrorDetailModal
        open={usageErrorModalOpen}
        logId={usageErrorModalLogId}
        model={usageErrorModalModel}
        onClose={() => setUsageErrorModalOpen(false)}
      />
    </div>
  );
}
