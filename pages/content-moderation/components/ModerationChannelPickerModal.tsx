import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Tags, X } from "lucide-react";
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
const BULK_PAGE_SIZE = 50;
type PickerTab = "auth" | "provider";
type ProviderScope = "provider_key" | "provider";

interface TagBindingPreview {
  tags: string[];
  tagMode: ContentModerationTagMode;
  matchedCount: number;
  rebindCount: number;
  operations: ContentModerationBindingOperation[];
}

function channelKey(channel: ContentModerationChannelView): string {
  return `${channel.channel_type}:${channel.channel_id}`;
}

function normalizeTags(values: string[]): string[] {
  const normalized = new Set<string>();
  for (const value of values) {
    for (const tag of value.split(/[\n,]+/)) {
      const clean = tag.trim().toLowerCase();
      if (clean) normalized.add(clean);
    }
  }
  return [...normalized];
}

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
  const openRef = useRef(open);
  const tagScanIdRef = useRef(0);
  const [tab, setTab] = useState<PickerTab>("auth");
  const [providerScope, setProviderScope] = useState<ProviderScope>("provider_key");
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagMode, setTagMode] = useState<ContentModerationTagMode>("any");
  const [provider, setProvider] = useState("");
  const [boundOnly, setBoundOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ContentModerationChannelView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagScanning, setTagScanning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rebindOperations, setRebindOperations] = useState<
    ContentModerationBindingOperation[] | null
  >(null);
  const [tagBindingPreview, setTagBindingPreview] = useState<TagBindingPreview | null>(null);

  const channelType: ContentModerationChannelType = tab === "auth" ? "auth_file" : providerScope;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const profileNames = useMemo(
    () => new Map(profiles.map((item) => [item.id, item.name])),
    [profiles],
  );
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(channelKey(row))),
    [rows, selected],
  );
  const selectedBindableCount = useMemo(
    () => selectedRows.filter((row) => row.profile_id !== profile?.id).length,
    [profile?.id, selectedRows],
  );
  const selectedUnbindableCount = useMemo(
    () => selectedRows.filter((row) => row.profile_id === profile?.id).length,
    [profile?.id, selectedRows],
  );
  const pendingTags = useMemo(() => normalizeTags([...tags, tagInput]), [tagInput, tags]);

  const loadChannels = useCallback(
    async (signal?: AbortSignal) => {
      if (!open || !profile) return;
      setLoading(true);
      try {
        const response = await contentModerationApi.listChannels({
          channel_type: channelType,
          query,
          tags,
          tag_mode: tagMode,
          provider,
          profile_id: boundOnly ? profile.id : undefined,
          page,
          page_size: PAGE_SIZE,
          signal,
        });
        setRows(response.items);
        setTotal(response.total);
        setSelected(
          new Set(
            response.items
              .filter((row) => row.profile_id === profile.id)
              .map((row) => channelKey(row)),
          ),
        );
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
    openRef.current = open;
  }, [open]);

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
    tagScanIdRef.current += 1;
    setTagScanning(false);
    if (!open) return;
    setTab("auth");
    setProviderScope("provider_key");
    setQuery("");
    setTags([]);
    setTagInput("");
    setTagMode("any");
    setProvider("");
    setBoundOnly(false);
    setPage(1);
    setSelected(new Set());
    setRebindOperations(null);
    setTagBindingPreview(null);
  }, [open, profile?.id]);

  const applyOperations = useCallback(
    async (
      operations: ContentModerationBindingOperation[],
      allowRebind: boolean,
      successMessage?: string,
    ) => {
      if (!operations.length) return;
      setSaving(true);
      try {
        await contentModerationApi.patchBindings({ allow_rebind: allowRebind, operations });
        setRebindOperations(null);
        setTagBindingPreview(null);
        notify({
          type: "success",
          message: successMessage ?? t("content_moderation.bindings_saved"),
        });
        onBindingsChanged();
        await loadChannels();
      } catch (error) {
        if (
          !allowRebind &&
          isApiClientError(error) &&
          extractApiErrorCode(error.payload) === "content_moderation_binding_conflict"
        ) {
          setTagBindingPreview(null);
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

  const toggleSelected = useCallback((row: ContentModerationChannelView, checked?: boolean) => {
    const key = channelKey(row);
    setSelected((current) => {
      const next = new Set(current);
      const shouldSelect = checked ?? !next.has(key);
      if (shouldSelect) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const bindSelected = () => {
    if (!profile) return;
    const operations = selectedRows
      .filter((row) => row.profile_id !== profile.id)
      .map((row) => ({
        channel_type: row.channel_type,
        channel_id: row.channel_id,
        profile_id: profile.id,
      }));
    if (!operations.length) return;
    const needsRebind = selectedRows.some((row) => row.profile_id && row.profile_id !== profile.id);
    if (needsRebind) {
      setRebindOperations(operations);
      return;
    }
    void applyOperations(operations, false);
  };

  const unbindSelected = () => {
    if (!profile) return;
    const operations = selectedRows
      .filter((row) => row.profile_id === profile.id)
      .map((row) => ({
        channel_type: row.channel_type,
        channel_id: row.channel_id,
        profile_id: null,
      }));
    void applyOperations(operations, false);
  };

  const commitTagInput = useCallback((value: string) => {
    const nextTags = normalizeTags([value]);
    if (nextTags.length) {
      setTags((current) => normalizeTags([...current, ...nextTags]));
      setPage(1);
    }
    setTagInput("");
  }, []);

  const removeTag = useCallback((tag: string) => {
    setTags((current) => current.filter((item) => item !== tag));
    setPage(1);
  }, []);

  const prepareTagBinding = useCallback(async () => {
    if (!profile || pendingTags.length === 0) return;
    const scanId = tagScanIdRef.current + 1;
    tagScanIdRef.current = scanId;
    setTags(pendingTags);
    setTagInput("");
    setPage(1);
    setTagScanning(true);
    try {
      const matchesByKey = new Map<string, ContentModerationChannelView>();
      let nextPage = 1;
      while (true) {
        const response = await contentModerationApi.listChannels({
          channel_type: channelType,
          tags: pendingTags,
          tag_mode: tagMode,
          page: nextPage,
          page_size: BULK_PAGE_SIZE,
        });
        if (tagScanIdRef.current !== scanId) return;
        for (const channel of response.items) {
          matchesByKey.set(channelKey(channel), channel);
        }
        const fetchedAll = nextPage * BULK_PAGE_SIZE >= response.total;
        if (fetchedAll || response.items.length === 0) break;
        nextPage += 1;
      }

      if (!openRef.current || tagScanIdRef.current !== scanId) return;
      const matches = [...matchesByKey.values()];
      if (matches.length === 0) {
        notify({ type: "info", message: t("content_moderation.tag_bind_no_matches") });
        return;
      }
      const operations = matches
        .filter((row) => row.profile_id !== profile.id)
        .map((row) => ({
          channel_type: row.channel_type,
          channel_id: row.channel_id,
          profile_id: profile.id,
        }));
      if (operations.length === 0) {
        notify({ type: "info", message: t("content_moderation.tag_bind_no_changes") });
        return;
      }
      setTagBindingPreview({
        tags: pendingTags,
        tagMode,
        matchedCount: matches.length,
        rebindCount: matches.filter((row) => row.profile_id && row.profile_id !== profile.id)
          .length,
        operations,
      });
    } catch (error) {
      if (openRef.current && tagScanIdRef.current === scanId) {
        notify({
          type: "error",
          message:
            error instanceof Error ? error.message : t("content_moderation.tag_bind_load_failed"),
        });
      }
    } finally {
      if (tagScanIdRef.current === scanId) setTagScanning(false);
    }
  }, [channelType, notify, pendingTags, profile, t, tagMode]);

  const columns = useMemo<DataTableColumn<ContentModerationChannelView>[]>(
    () => [
      {
        key: "select",
        label: t("content_moderation.select"),
        width: "w-16 min-w-16",
        resizable: false,
        reorderable: false,
        lockOrder: "start",
        render: (row) => {
          const key = channelKey(row);
          return (
            <div
              className="flex items-center"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={selected.has(key)}
                aria-label={t("content_moderation.select_channel", { name: row.name })}
                onCheckedChange={(checked) => toggleSelected(row, checked)}
                disabled={saving || loading}
              />
            </div>
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
              {row.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-white/60"
                >
                  {tag}
                </span>
              ))}
              {row.tags.length > 3 ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-white/10 dark:text-white/50">
                  +{row.tags.length - 3}
                </span>
              ) : null}
            </div>
          ) : (
            "--"
          ),
      },
      {
        key: "binding",
        label: t("content_moderation.current_profile"),
        width: "w-[200px] min-w-[200px]",
        render: (row) => {
          if (!row.profile_id) {
            return (
              <span className="text-slate-400 dark:text-white/40">
                {t("content_moderation.profile_none")}
              </span>
            );
          }
          const isCurrentProfile = row.profile_id === profile?.id;
          return (
            <span
              className={[
                "inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold",
                isCurrentProfile
                  ? "bg-sky-500/10 text-sky-700 dark:text-sky-200"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-200",
              ].join(" ")}
            >
              <span className="truncate">{profileNames.get(row.profile_id) ?? row.profile_id}</span>
            </span>
          );
        },
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
    ],
    [loading, profile?.id, profileNames, saving, selected, t, toggleSelected],
  );

  const tagBindingDescription = tagBindingPreview
    ? [
        t("content_moderation.tag_bind_confirm_description", {
          tags: tagBindingPreview.tags.join(", "),
          mode: t(`content_moderation.tag_mode_${tagBindingPreview.tagMode}`),
          count: tagBindingPreview.matchedCount,
          changeCount: tagBindingPreview.operations.length,
        }),
        tagBindingPreview.rebindCount > 0
          ? t("content_moderation.tag_bind_rebind_warning", {
              count: tagBindingPreview.rebindCount,
            })
          : "",
        t("content_moderation.tag_bind_hint"),
      ]
        .filter(Boolean)
        .join(" ")
    : "";

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
          <div className="mr-auto min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-white/70">
              {t("content_moderation.selected_count", { count: selected.size })}
            </p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-white/40">
              {t("content_moderation.page_selection_hint")}
            </p>
          </div>
          <Button variant="secondary" onClick={onClose} disabled={saving || tagScanning}>
            {t("common.close")}
          </Button>
          {selectedUnbindableCount > 0 ? (
            <Button
              variant="ghost"
              onClick={unbindSelected}
              disabled={loading || saving || tagScanning}
            >
              {t("content_moderation.unbind_selected")}
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={bindSelected}
            disabled={selectedBindableCount === 0 || loading || saving || tagScanning}
          >
            {t("content_moderation.bind_selected")}
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Tabs
          value={tab}
          size="sm"
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

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.035]">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-8">
            <TextInput
              size="sm"
              className="sm:col-span-2 xl:col-span-2"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setPage(1);
              }}
              placeholder={t("content_moderation.search_channels")}
              aria-label={t("content_moderation.search_channels")}
            />
            <TextInput
              size="sm"
              value={provider}
              onChange={(event) => {
                setProvider(event.currentTarget.value);
                setPage(1);
              }}
              placeholder={t("content_moderation.filter_provider")}
              aria-label={t("content_moderation.filter_provider")}
            />
            {tab === "provider" ? (
              <Select
                size="sm"
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
            ) : null}
            <TextInput
              size="sm"
              className="sm:col-span-2 xl:col-span-2"
              value={tagInput}
              onChange={(event) => setTagInput(event.currentTarget.value)}
              onBlur={(event) => commitTagInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  commitTagInput(event.currentTarget.value);
                  return;
                }
                if (event.key === "Backspace" && !event.currentTarget.value && tags.length > 0) {
                  removeTag(tags[tags.length - 1]);
                }
              }}
              placeholder={t("content_moderation.tag_filter_placeholder")}
              aria-label={t("content_moderation.filter_tags")}
            />
            <Select
              size="sm"
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
            <Select
              size="sm"
              className={tab === "auth" ? "xl:col-span-2" : undefined}
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

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3 dark:border-white/10">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {tags.length > 0 ? (
                tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white/75 dark:ring-white/10"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={t("content_moderation.remove_filter_tag", { tag })}
                      className="rounded-full text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:text-white/40 dark:hover:text-white dark:focus-visible:ring-white/20"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400 dark:text-white/40">
                  {t("content_moderation.tag_filter_hint")}
                </span>
              )}
            </div>
            <span className="max-w-md text-xs text-slate-500 dark:text-white/50">
              {t("content_moderation.tag_bind_hint")}
            </span>
            <Button
              size="sm"
              onClick={() => void prepareTagBinding()}
              disabled={pendingTags.length === 0 || loading || saving || tagScanning}
            >
              {tagScanning ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Tags size={14} aria-hidden="true" />
              )}
              {tagScanning
                ? t("content_moderation.tag_bind_scanning")
                : t("content_moderation.tag_bind")}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <DataTable<ContentModerationChannelView>
            tableId="content-moderation-channels"
            rows={rows}
            columns={columns}
            rowKey={(row) => channelKey(row)}
            loading={loading}
            rowHeight={56}
            minWidth="min-w-[980px]"
            height="h-full"
            minHeight="min-h-[300px]"
            caption={t("content_moderation.channels_table_caption")}
            emptyText={t("content_moderation.channels_empty")}
            showAllLoadedMessage={false}
            columnResizable={false}
            columnReorderable={false}
            rowAriaSelected={(row) => selected.has(channelKey(row))}
            rowClassName={(row) =>
              selected.has(channelKey(row)) ? "bg-sky-50/75 dark:bg-sky-500/[0.08]" : ""
            }
            onRowClick={(row) => toggleSelected(row)}
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
        open={tagBindingPreview !== null}
        title={t("content_moderation.tag_bind_title")}
        description={tagBindingDescription}
        confirmText={t("content_moderation.tag_bind_confirm")}
        variant="primary"
        busy={saving}
        onClose={() => setTagBindingPreview(null)}
        onConfirm={() => {
          if (!tagBindingPreview) return;
          void applyOperations(
            tagBindingPreview.operations,
            tagBindingPreview.rebindCount > 0,
            t("content_moderation.tag_bind_saved", {
              count: tagBindingPreview.operations.length,
            }),
          );
        }}
      />

      <ConfirmModal
        open={rebindOperations !== null}
        title={t("content_moderation.rebind_title")}
        description={t("content_moderation.rebind_selected_description", {
          count: rebindOperations?.length ?? 0,
        })}
        confirmText={t("content_moderation.rebind_confirm")}
        variant="primary"
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
