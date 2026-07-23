import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2Off } from "lucide-react";
import {
  contentModerationApi,
  extractApiErrorCode,
  isApiClientError,
  type ContentModerationBindingOperation,
  type ContentModerationChannelType,
  type ContentModerationChannelView,
  type ContentModerationProfileView,
  type ContentModerationTagMode,
} from "@code-proxy/api-client";
import {
  Button,
  Checkbox,
  ConfirmModal,
  DataTable,
  Modal,
  PaginationBar,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  TextInput,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";

const PAGE_SIZE = 20;
type PickerTab = "auth" | "provider";
type ProviderScope = "provider_key" | "provider";

export interface ModerationChannelPickerModalProps {
  open: boolean;
  profile: ContentModerationProfileView | null;
  profiles: ContentModerationProfileView[];
  onClose: () => void;
  onBindingsChanged: () => void;
}

export function ModerationChannelPickerModal({
  open,
  profile,
  profiles,
  onClose,
  onBindingsChanged,
}: ModerationChannelPickerModalProps) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [tab, setTab] = useState<PickerTab>("auth");
  const [providerScope, setProviderScope] = useState<ProviderScope>("provider_key");
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState("");
  const [tagMode, setTagMode] = useState<ContentModerationTagMode>("any");
  const [provider, setProvider] = useState("");
  const [boundOnly, setBoundOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ContentModerationChannelView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rebindOperations, setRebindOperations] = useState<
    ContentModerationBindingOperation[] | null
  >(null);

  const channelType: ContentModerationChannelType = tab === "auth" ? "auth_file" : providerScope;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const profileNames = useMemo(
    () => new Map(profiles.map((item) => [item.id, item.name])),
    [profiles],
  );

  const loadChannels = useCallback(
    async (signal?: AbortSignal) => {
      if (!open || !profile) return;
      setLoading(true);
      try {
        const response = await contentModerationApi.listChannels({
          channel_type: channelType,
          query,
          tags: tags
            .split(/[\n,]+/)
            .map((item) => item.trim())
            .filter(Boolean),
          tag_mode: tagMode,
          provider,
          profile_id: boundOnly ? profile.id : undefined,
          page,
          page_size: PAGE_SIZE,
          signal,
        });
        setRows(response.items);
        setTotal(response.total);
        setSelected(new Set());
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify({
          type: "error",
          message:
            error instanceof Error ? error.message : t("content_moderation.channels_load_failed"),
        });
      } finally {
        setLoading(false);
      }
    },
    [boundOnly, channelType, open, page, profile, provider, query, tagMode, tags, notify, t],
  );

  useEffect(() => {
    if (!open || !profile) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void loadChannels(controller.signal), 220);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadChannels, open, profile]);

  useEffect(() => {
    if (!open) return;
    setTab("auth");
    setProviderScope("provider_key");
    setQuery("");
    setTags("");
    setTagMode("any");
    setProvider("");
    setBoundOnly(false);
    setPage(1);
    setSelected(new Set());
  }, [open, profile?.id]);

  const applyOperations = useCallback(
    async (operations: ContentModerationBindingOperation[], allowRebind: boolean) => {
      setSaving(true);
      try {
        await contentModerationApi.patchBindings({ allow_rebind: allowRebind, operations });
        setRebindOperations(null);
        notify({ type: "success", message: t("content_moderation.bindings_saved") });
        onBindingsChanged();
        await loadChannels();
      } catch (error) {
        if (
          !allowRebind &&
          isApiClientError(error) &&
          extractApiErrorCode(error.payload) === "content_moderation_binding_conflict"
        ) {
          setRebindOperations(operations);
          return;
        }
        notify({
          type: "error",
          message:
            error instanceof Error ? error.message : t("content_moderation.binding_save_failed"),
        });
      } finally {
        setSaving(false);
      }
    },
    [loadChannels, notify, onBindingsChanged, t],
  );

  const bindSelected = () => {
    if (!profile) return;
    const operations = rows
      .filter((row) => selected.has(`${row.channel_type}:${row.channel_id}`))
      .map((row) => ({
        channel_type: row.channel_type,
        channel_id: row.channel_id,
        profile_id: profile.id,
      }));
    if (!operations.length) return;
    const needsRebind = rows.some(
      (row) =>
        selected.has(`${row.channel_type}:${row.channel_id}`) &&
        row.profile_id &&
        row.profile_id !== profile.id,
    );
    if (needsRebind) {
      setRebindOperations(operations);
      return;
    }
    void applyOperations(operations, false);
  };

  const unbind = (row: ContentModerationChannelView) => {
    void applyOperations(
      [
        {
          channel_type: row.channel_type,
          channel_id: row.channel_id,
          profile_id: null,
        },
      ],
      false,
    );
  };

  const columns = useMemo<DataTableColumn<ContentModerationChannelView>[]>(
    () => [
      {
        key: "select",
        label: t("content_moderation.select"),
        width: "w-16 min-w-16",
        render: (row) => {
          const key = `${row.channel_type}:${row.channel_id}`;
          return (
            <Checkbox
              checked={selected.has(key)}
              aria-label={t("content_moderation.select_channel", { name: row.name })}
              onCheckedChange={(checked) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(key);
                  else next.delete(key);
                  return next;
                })
              }
            />
          );
        },
      },
      {
        key: "name",
        label: t("content_moderation.channel_name"),
        width: "w-[240px] min-w-[240px]",
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 dark:text-white">{row.name}</p>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-white/50">
              {row.channel_id}
            </p>
          </div>
        ),
      },
      {
        key: "provider",
        label: t("content_moderation.provider"),
        width: "w-36 min-w-36",
        render: (row) => row.provider || "--",
      },
      {
        key: "tags",
        label: t("content_moderation.tags"),
        width: "w-[220px] min-w-[220px]",
        render: (row) =>
          row.tags.length ? (
            <div className="flex flex-wrap gap-1">
              {row.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-white/60"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            "--"
          ),
      },
      {
        key: "binding",
        label: t("content_moderation.current_profile"),
        width: "w-[200px] min-w-[200px]",
        render: (row) =>
          row.profile_id ? (
            <span className="font-medium text-slate-800 dark:text-white/80">
              {profileNames.get(row.profile_id) ?? row.profile_id}
            </span>
          ) : (
            <span className="text-slate-400 dark:text-white/40">
              {t("content_moderation.profile_none")}
            </span>
          ),
      },
      {
        key: "status",
        label: t("content_moderation.status"),
        width: "w-28 min-w-28",
        render: (row) =>
          row.disabled ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-200">
              {t("content_moderation.channel_disabled")}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
              {t("content_moderation.channel_enabled")}
            </span>
          ),
      },
      {
        key: "actions",
        label: t("content_moderation.actions"),
        width: "w-24 min-w-24",
        render: (row) =>
          row.profile_id === profile?.id ? (
            <Button
              size="xs"
              variant="ghost"
              title={t("content_moderation.unbind")}
              aria-label={t("content_moderation.unbind_channel", { name: row.name })}
              onClick={() => unbind(row)}
              disabled={saving}
            >
              <Link2Off size={15} />
            </Button>
          ) : null,
      },
    ],
    [profile?.id, profileNames, saving, selected, t],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("content_moderation.channels_title")}
      description={
        profile ? t("content_moderation.channels_description", { name: profile.name }) : undefined
      }
      maxWidth="max-w-6xl"
      bodyHeightClassName="h-[78vh] max-h-[78vh]"
      bodyOverflowClassName="overflow-hidden"
      bodyClassName="flex min-h-0 flex-col"
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500 dark:text-white/55">
            {t("content_moderation.selected_count", { count: selected.size })}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.close")}
          </Button>
          <Button variant="primary" onClick={bindSelected} disabled={selected.size === 0 || saving}>
            {t("content_moderation.bind_selected")}
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (value !== "auth" && value !== "provider") return;
            setTab(value);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="auth">{t("content_moderation.tab_auth_files")}</TabsTrigger>
            <TabsTrigger value="provider">{t("content_moderation.tab_providers")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid gap-3 rounded-xl bg-slate-50/80 p-3 md:grid-cols-2 xl:grid-cols-5 dark:bg-white/[0.04]">
          <TextInput
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
            placeholder={t("content_moderation.search_channels")}
            aria-label={t("content_moderation.search_channels")}
          />
          <TextInput
            value={provider}
            onChange={(event) => {
              setProvider(event.currentTarget.value);
              setPage(1);
            }}
            placeholder={t("content_moderation.filter_provider")}
            aria-label={t("content_moderation.filter_provider")}
          />
          {tab === "auth" ? (
            <TextInput
              value={tags}
              onChange={(event) => {
                setTags(event.currentTarget.value);
                setPage(1);
              }}
              placeholder={t("content_moderation.filter_tags")}
              aria-label={t("content_moderation.filter_tags")}
            />
          ) : (
            <Select
              value={providerScope}
              onChange={(value) => {
                if (value !== "provider_key" && value !== "provider") return;
                setProviderScope(value);
                setPage(1);
              }}
              options={[
                {
                  value: "provider_key",
                  label: t("content_moderation.provider_scope_keys"),
                },
                {
                  value: "provider",
                  label: t("content_moderation.provider_scope_defaults"),
                },
              ]}
              aria-label={t("content_moderation.provider_scope")}
            />
          )}
          {tab === "auth" ? (
            <Select
              value={tagMode}
              onChange={(value) => {
                if (value !== "any" && value !== "all") return;
                setTagMode(value);
                setPage(1);
              }}
              options={[
                { value: "any", label: t("content_moderation.tag_mode_any") },
                { value: "all", label: t("content_moderation.tag_mode_all") },
              ]}
              aria-label={t("content_moderation.tag_mode")}
            />
          ) : (
            <div />
          )}
          <Select
            value={boundOnly ? "bound" : "all"}
            onChange={(value) => {
              setBoundOnly(value === "bound");
              setPage(1);
            }}
            options={[
              { value: "all", label: t("content_moderation.filter_all_channels") },
              { value: "bound", label: t("content_moderation.filter_bound_channels") },
            ]}
            aria-label={t("content_moderation.binding_filter")}
          />
        </div>

        <div className="min-h-0 flex-1">
          <DataTable<ContentModerationChannelView>
            tableId="content-moderation-channels"
            rows={rows}
            columns={columns}
            rowKey={(row) => `${row.channel_type}:${row.channel_id}`}
            loading={loading}
            rowHeight={58}
            minWidth="min-w-[1120px]"
            height="h-full"
            minHeight="min-h-[320px]"
            caption={t("content_moderation.channels_table_caption")}
            emptyText={t("content_moderation.channels_empty")}
            showAllLoadedMessage={false}
          />
        </div>

        <PaginationBar
          currentPage={page}
          totalPages={totalPages}
          totalCount={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          labels={{
            firstPage: t("content_moderation.first_page"),
            previousPage: t("content_moderation.previous_page"),
            nextPage: t("content_moderation.next_page"),
            lastPage: t("content_moderation.last_page"),
            pageInfo: ({ start, end, total: totalCount }) =>
              t("content_moderation.page_info", { start, end, total: totalCount }),
          }}
        />
      </div>

      <ConfirmModal
        open={rebindOperations !== null}
        title={t("content_moderation.rebind_title")}
        description={t("content_moderation.rebind_selected_description", {
          count: rebindOperations?.length ?? 0,
        })}
        confirmText={t("content_moderation.rebind_confirm")}
        busy={saving}
        onClose={() => setRebindOperations(null)}
        onConfirm={() => {
          if (!rebindOperations) return;
          void applyOperations(rebindOperations, true);
        }}
      />
    </Modal>
  );
}
