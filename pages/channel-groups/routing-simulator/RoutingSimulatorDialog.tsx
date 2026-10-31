import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Route } from "lucide-react";
import { apiKeyEntriesApi, type ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import { modelsApi } from "@code-proxy/api-client/endpoints/models";
import {
  routingSimulationApi,
  type RoutingSimulationEndpoint,
  type RoutingSimulationParams,
  type RoutingSimulationResult as SimulationResult,
} from "@code-proxy/api-client/endpoints/routing-simulation";
import {
  Button,
  Callout,
  FormField,
  Modal,
  SearchableSelect,
  Select,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import { RoutingSimulationResult, simulationHeadline } from "./RoutingSimulationResult";

export type SimulatorPathRoute = { path: string; group: string };

type Outcome = { result: SimulationResult; params: RoutingSimulationParams; receivedAt: number };

const sameParams = (a: RoutingSimulationParams, b: RoutingSimulationParams) =>
  a.apiKeyId === b.apiKeyId &&
  a.model === b.model &&
  (a.routePath ?? "") === (b.routePath ?? "") &&
  a.endpoint === b.endpoint;

/** 只有带 id 的 Key 能模拟：后端按 id 在当前租户里找 Key，不收明文。 */
const simulatableKeys = (entries: ApiKeyEntry[]) =>
  entries
    .filter((entry) => Boolean(entry.id?.trim()))
    .sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || ""));

/**
 * 「模拟一次请求」：选一个 API Key 和模型，看请求会经过哪些检查、落到哪个分组的哪个账号，
 * 账号为什么能用或不能用。后端不发往上游、不计入 Key 的限额。
 */
export function RoutingSimulatorDialog({
  open,
  pathRoutes,
  onClose,
}: {
  open: boolean;
  pathRoutes: SimulatorPathRoute[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKeyEntry[] | null>(null);
  const [keysError, setKeysError] = useState("");
  const [keyId, setKeyId] = useState("");
  const [model, setModel] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [routePath, setRoutePath] = useState("");
  const [endpoint, setEndpoint] = useState<RoutingSimulationEndpoint>("chat-completions");
  const [submitted, setSubmitted] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // 读屏只播报结论这一句：结果里的表格很长，整块设成播报区会被从头读到尾。
  const [announcement, setAnnouncement] = useState("");

  // 每次打开都重新取 Key 列表，期间新建的 Key 也能选；取的时候先留着上次的列表。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setKeysError("");
    apiKeyEntriesApi
      .list()
      .then((entries) => {
        if (!cancelled) setKeys(simulatableKeys(entries));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setKeys((previous) => previous ?? []);
        setKeysError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedKey = useMemo(() => keys?.find((entry) => entry.id === keyId), [keyId, keys]);

  // 模型候选跟着 Key 走：Key 限定了模型就只给这些，否则给它能用的渠道和分组下的模型。
  // 只是输入提示，可以照样输入别名或带思考后缀的名字。
  useEffect(() => {
    if (!selectedKey) {
      setModelOptions([]);
      return;
    }
    const allowed = (selectedKey["allowed-models"] ?? []).map((m) => m.trim()).filter(Boolean);
    if (allowed.length > 0) {
      setModelOptions(allowed);
      return;
    }
    let cancelled = false;
    modelsApi
      .listAvailableModels({
        allowedChannelGroups: selectedKey["allowed-channel-groups"],
        allowedChannels: selectedKey["allowed-channels"],
      })
      .then((models) => {
        if (!cancelled) setModelOptions(models.map((m) => m.id));
      })
      .catch(() => {
        if (!cancelled) setModelOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  const keyOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (keys ?? []).map((entry) => {
        const id = entry.id ?? "";
        const name = entry.name?.trim() || id;
        return {
          value: id,
          label: name,
          searchText: `${name} ${id}`,
          trailing: entry.disabled ? (
            <span className="rounded-md bg-subtle px-1.5 py-0.5 text-2xs text-ink-3">
              {t("channel_groups_page.simulator.key_disabled")}
            </span>
          ) : undefined,
        };
      }),
    [keys, t],
  );

  const modelSelectOptions = useMemo<SearchableSelectOption[]>(() => {
    const ids = model && !modelOptions.includes(model) ? [model, ...modelOptions] : modelOptions;
    return ids.map((id) => ({ value: id, label: id }));
  }, [model, modelOptions]);

  const routeOptions = useMemo(
    () => [
      { value: "", label: t("channel_groups_page.simulator.route_none") },
      ...pathRoutes
        .filter((route) => route.path.trim())
        .map((route) => ({
          value: route.path.trim(),
          label: `${route.path.trim()} → ${route.group}`,
        })),
    ],
    [pathRoutes, t],
  );

  const params: RoutingSimulationParams = {
    apiKeyId: keyId,
    model: model.trim(),
    routePath: routePath || undefined,
    endpoint,
  };
  const keyMissing = !keyId;
  const modelMissing = !model.trim();

  const run = async () => {
    setSubmitted(true);
    if (keyMissing || modelMissing || running) return;
    setRunning(true);
    setError("");
    // 先清空再写入，同样的结论再跑一次也会重新播报。
    setAnnouncement("");
    try {
      const result = await routingSimulationApi.run(params);
      setOutcome({ result, params, receivedAt: Date.now() });
      setAnnouncement(simulationHeadline(t, result));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      size="xl"
      icon={<Route />}
      title={t("channel_groups_page.simulator.title")}
      description={t("channel_groups_page.simulator.description")}
      dirty={false}
      onSubmitShortcut={() => void run()}
      onClose={onClose}
      footerStart={
        outcome && !sameParams(outcome.params, params) ? (
          <span className="text-xs text-ink-3">{t("channel_groups_page.simulator.stale")}</span>
        ) : undefined
      }
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button size="sm" variant="primary" onClick={() => void run()} disabled={running}>
            <Play size={14} />
            {running
              ? t("channel_groups_page.simulator.running")
              : t("channel_groups_page.simulator.run")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {keysError ? (
          <Callout tone="danger" role="alert">
            {t("channel_groups_page.simulator.keys_failed", { message: keysError })}
          </Callout>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <FormField
            label={t("channel_groups_page.simulator.key")}
            error={
              submitted && keyMissing ? t("channel_groups_page.simulator.key_required") : undefined
            }
          >
            <SearchableSelect
              value={keyId}
              onChange={setKeyId}
              options={keyOptions}
              placeholder={
                keys === null
                  ? t("channel_groups_page.simulator.keys_loading")
                  : keys.length === 0
                    ? t("channel_groups_page.simulator.keys_empty")
                    : t("channel_groups_page.simulator.key_placeholder")
              }
              searchPlaceholder={t("channel_groups_page.simulator.key_search")}
              aria-label={t("channel_groups_page.simulator.key")}
              disabled={keys === null || keys.length === 0}
              className="w-full"
            />
          </FormField>
          <FormField
            label={t("channel_groups_page.simulator.model")}
            description={t("channel_groups_page.simulator.model_hint")}
            error={
              submitted && modelMissing
                ? t("channel_groups_page.simulator.model_required")
                : undefined
            }
          >
            <SearchableSelect
              value={model}
              onChange={setModel}
              options={modelSelectOptions}
              allowCreate
              onCreate={setModel}
              createLabel={(value) =>
                t("channel_groups_page.simulator.model_use", { model: value })
              }
              placeholder={t("channel_groups_page.simulator.model_placeholder")}
              searchPlaceholder={t("channel_groups_page.simulator.model_search")}
              aria-label={t("channel_groups_page.simulator.model")}
              className="w-full"
            />
          </FormField>
          <FormField label={t("channel_groups_page.simulator.route")} className="min-w-0">
            <Select
              value={routePath}
              onChange={setRoutePath}
              options={routeOptions}
              aria-label={t("channel_groups_page.simulator.route")}
              className="w-full"
            />
          </FormField>
          <FormField label={t("channel_groups_page.simulator.endpoint")} className="min-w-0">
            <Select
              value={endpoint}
              onChange={(value) => setEndpoint(value as RoutingSimulationEndpoint)}
              options={[
                {
                  value: "chat-completions",
                  label: t("channel_groups_page.simulator.endpoint_chat"),
                },
                { value: "messages", label: t("channel_groups_page.simulator.endpoint_messages") },
              ]}
              aria-label={t("channel_groups_page.simulator.endpoint")}
              className="w-full"
            />
          </FormField>
        </div>
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
        <p className="sr-only" role="status">
          {announcement}
        </p>
        {outcome ? (
          <RoutingSimulationResult result={outcome.result} nowMs={outcome.receivedAt} />
        ) : null}
      </div>
    </Modal>
  );
}
