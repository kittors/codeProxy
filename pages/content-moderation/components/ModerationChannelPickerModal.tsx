import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2 } from "@code-proxy/ui/icons";
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
  DataGrid,
  DataGridPagination,
  GRID_WIDTH,
  Modal,
  Tabs,
  TabsList,
  TabsTrigger,
  useToast,
  type DataGridColumn,
} from "@code-proxy/ui";
import {
  RebindChannelsConfirm,
  TagBindingConfirm,
  type TagBindingPreview,
} from "./ChannelPickerConfirms";
import { ChannelPickerFilters, type PickerTab, type ProviderScope } from "./ChannelPickerFilters";

const PAGE_SIZE = 20;
const BULK_PAGE_SIZE = 50;

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

  const columns = useMemo<DataGridColumn<ContentModerationChannelView>[]>(
    () => [
      {
        // 勾选要绑定的渠道（跨页保留、底部按钮统一提交），点整行也能勾；勾上的行是选中行的底色。
        id: "select",
        header: t("content_moderation.select"),
        pin: "start",
        align: "center",
        width: 56,
        resizable: false,
        overflowTooltip: false,
        cell: (row) => {
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
        id: "name",
        header: t("content_moderation.channel_name"),
        width: 240,
        grow: true,
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{row.name}</p>
            <p className="mt-0.5 truncate font-mono text-xs text-ink-3">{row.channel_id}</p>
          </div>
        ),
      },
      {
        id: "provider",
        header: t("content_moderation.provider"),
        width: GRID_WIDTH.numericWide,
        cell: (row) => row.provider || "--",
      },
      {
        id: "tags",
        header: t("content_moderation.tags"),
        width: 220,
        cell: (row) =>
          row.tags.length ? (
            <div className="flex flex-wrap gap-1">
              {row.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs text-ink-2 dark:bg-white/[0.07]"
                >
                  {tag}
                </span>
              ))}
              {row.tags.length > 3 ? (
                <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs text-ink-3 dark:bg-white/[0.07]">
                  +{row.tags.length - 3}
                </span>
              ) : null}
            </div>
          ) : (
            "--"
          ),
      },
      {
        id: "binding",
        header: t("content_moderation.current_profile"),
        width: GRID_WIDTH.name,
        cell: (row) => {
          if (!row.profile_id) {
            return (
              // 「未绑定」是要读得清的信息，用弱化色 ink-3（ink-4 只给占位装饰，对比度不够）。
              <span className="text-ink-3">{t("content_moderation.profile_none")}</span>
            );
          }
          const isCurrentProfile = row.profile_id === profile?.id;
          return (
            <span
              className={[
                "inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-semibold",
                isCurrentProfile
                  ? "bg-accent-soft text-accent-ink colorful:bg-sky-500/10 colorful:text-sky-700 colorful:dark:text-sky-300"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
              ].join(" ")}
            >
              <span className="truncate">{profileNames.get(row.profile_id) ?? row.profile_id}</span>
            </span>
          );
        },
      },
      {
        id: "status",
        header: t("content_moderation.status"),
        width: GRID_WIDTH.badge,
        cell: (row) =>
          row.disabled ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {t("content_moderation.channel_disabled")}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {t("content_moderation.channel_enabled")}
            </span>
          ),
      },
    ],
    [loading, profile?.id, profileNames, saving, selected, t, toggleSelected],
  );

  // 本页里会被替换绑定的渠道：确认框里列出「渠道 · 原配置」，让用户知道改的是谁。
  const rebindAffected = useMemo(() => {
    if (!rebindOperations || !profile) return [];
    const keys = new Set(rebindOperations.map((op) => `${op.channel_type}:${op.channel_id}`));
    return rows.filter(
      (row) => keys.has(channelKey(row)) && row.profile_id && row.profile_id !== profile.id,
    );
  }, [profile, rebindOperations, rows]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("content_moderation.channels_title")}
      description={
        profile ? t("content_moderation.channels_description", { name: profile.name }) : undefined
      }
      icon={<Link2 />}
      // 表格最小宽 980px，xl 档放不下，沿用原来的 6xl 宽度。
      size="2xl"
      bodyHeightClassName="h-[78vh] max-h-[78vh]"
      bodyOverflowClassName="overflow-hidden"
      bodyClassName="flex min-h-0 flex-col"
      footerStart={
        <span>
          <span className="font-medium text-ink-2">
            {t("content_moderation.selected_count", { count: selected.size })}
          </span>
          <span className="ml-2">{t("content_moderation.page_selection_hint")}</span>
        </span>
      }
      footer={
        <>
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

        <ChannelPickerFilters
          tab={tab}
          providerScope={providerScope}
          query={query}
          provider={provider}
          boundOnly={boundOnly}
          tags={tags}
          tagInput={tagInput}
          tagMode={tagMode}
          canTagBind={pendingTags.length > 0 && !loading && !saving && !tagScanning}
          tagScanning={tagScanning}
          onQueryChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          onProviderChange={(value) => {
            setProvider(value);
            setPage(1);
          }}
          onProviderScopeChange={(value) => {
            setProviderScope(value);
            setPage(1);
          }}
          onBoundOnlyChange={(value) => {
            setBoundOnly(value);
            setPage(1);
          }}
          onTagInputChange={setTagInput}
          onCommitTag={commitTagInput}
          onRemoveTag={removeTag}
          onTagModeChange={(value) => {
            setTagMode(value);
            setPage(1);
          }}
          onTagBind={() => void prepareTagBinding()}
        />

        {/* 弹窗正文是固定高度：表格铺满剩下的空间，分页落在表格底部，翻到行少的页也不跳。 */}
        <div className="flex min-h-0 flex-1 flex-col">
          <DataGrid<ContentModerationChannelView>
            id="content-moderation-channels"
            frame={false}
            fill
            rows={rows}
            columns={columns}
            rowKey={(row) => channelKey(row)}
            loading={loading}
            label={t("content_moderation.channels_table_caption")}
            empty={{ title: t("content_moderation.channels_empty") }}
            resizable={false}
            columnReorder={false}
            isRowActive={(row) => selected.has(channelKey(row))}
            onRowClick={(row) => toggleSelected(row)}
            resetScrollKey={page}
            footer={
              <DataGridPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={setPage}
              />
            }
          />
        </div>
      </div>

      <TagBindingConfirm
        preview={tagBindingPreview}
        profileName={profile?.name ?? ""}
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

      <RebindChannelsConfirm
        operationCount={rebindOperations?.length ?? null}
        affected={rebindAffected}
        profileName={profile?.name ?? ""}
        profileNames={profileNames}
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
