import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Plus, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import {
  endUsersApi,
  quotaMatrixEquals,
  quotaMatrixToPatch,
  type ApiKeyDailySpendingResetEvent,
  type EndUser,
  type EndUserAPIKey,
  type EndUserAPIKeyMutationBody,
  type QuotaResetPeriod,
} from "@code-proxy/api-client";
import {
  Button,
  ConfirmModal,
  Modal,
  SecretRevealModal,
  copyTextToClipboard,
  surface,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import {
  KeyPolicyModal,
  PolicyBadges,
  QuotaUsageCell,
  describeWindowParts,
  resettableWindows,
  type KeyPolicyValue,
  type ModelOption,
} from "@features/access-policy";
import {
  OwnedApiKeysTable,
  PeriodQuotaResetModal,
  SpendingResetHistoryModal,
  formatQuotaValidationError,
} from "@features/period-spending";
import { useOwnedKeys } from "../hooks/useOwnedKeys";
import { endUserLabel } from "../endUserForm";

type EditorState = { mode: "create" } | { mode: "edit"; key: EndUserAPIKey } | null;

const sameRules = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 管理某个账号名下的全部 Key：名称、暂停 / 恢复、复制、轮换、子额度与按模型规则、重置、删除。
 *
 * 以前这里嵌入整张 Key 管理页（还会为复制顺带下载整个租户的 Key 明文）；现在是只服务账号 Key
 * 的一张表，明文在点复制时按需取一把。顶部常驻账号的额度用量：Key 的子额度不能超过它。
 */
export function EndUserKeysModal({
  user,
  catalog,
  canWrite,
  onViewKeyUsage,
  onClose,
}: {
  user: EndUser | null;
  catalog: readonly ModelOption[];
  canWrite: boolean;
  /** 打开一把 Key 的用量统计（父组件持有用量弹窗）。 */
  onViewKeyUsage: (key: EndUserAPIKey, secret: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const owned = useOwnedKeys(user?.id ?? null);
  const { keys, capabilities, loading, busyKeyId, setBusyKeyId, load, resolveSecret } = owned;
  const [editor, setEditor] = useState<EditorState>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<EndUserAPIKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EndUserAPIKey | null>(null);
  const [resetTarget, setResetTarget] = useState<EndUserAPIKey | null>(null);
  const [resetError, setResetError] = useState("");
  const [historyTarget, setHistoryTarget] = useState<EndUserAPIKey | null>(null);
  const [historyEvents, setHistoryEvents] = useState<ApiKeyDailySpendingResetEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const policyCaps = capabilities.accessPolicy;
  const userId = user?.id ?? "";
  const accountLimits = user?.["quota-limits"];

  const showSecret = (plain: string | undefined) => {
    if (!plain) return;
    setSecret(plain);
    void copyTextToClipboard(plain).catch(() => undefined);
  };

  const keyColumns = useMemo<DataTableColumn<EndUserAPIKey>[]>(
    () =>
      policyCaps
        ? [
            {
              key: "rules",
              label: t("access_policy.col_model_policy"),
              width: "w-40 min-w-[9rem]",
              overflowTooltip: false,
              render: (row) => <PolicyBadges rules={row["model-rules"]} usage={row["quota-usage"]} />,
            },
          ]
        : [],
    [policyCaps, t],
  );

  const submitKey = async (value: KeyPolicyValue) => {
    if (!user || !editor) return;
    setSaving(true);
    setServerError("");
    try {
      const body: EndUserAPIKeyMutationBody = {};
      const previous = editor.mode === "edit" ? editor.key : null;
      if (!previous || value.name !== previous.name) body.name = value.name;
      if (policyCaps) {
        if (!previous || !quotaMatrixEquals(value.limits, previous["quota-limits"])) {
          body["quota-limits"] = quotaMatrixToPatch(value.limits);
        }
        if (!previous || !sameRules(value.rules, previous["model-rules"])) body["model-rules"] = value.rules;
      } else {
        // 旧后端只认识美元四周期子额度。
        body["daily-spending-limit"] = value.limits.cost.day;
        body["period-spending-limits"] = {
          "5h": value.limits.cost["5h"],
          day: value.limits.cost.day,
          week: value.limits.cost.week,
          month: value.limits.cost.month,
        };
      }
      if (previous) {
        if (Object.keys(body).length > 0) await endUsersApi.updateKey(user.id, previous.id, body);
        notify({ type: "success", message: t("api_keys_page.updated_success") });
      } else {
        const created = await endUsersApi.createKey(user.id, body);
        showSecret(created.plaintext_key);
        notify({ type: "success", message: t("api_keys_page.created_success") });
      }
      setEditor(null);
      await load();
    } catch (err) {
      setServerError(formatQuotaValidationError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (keyId: string, action: () => Promise<void>, failure: string) => {
    setBusyKeyId(keyId);
    try {
      await action();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : failure });
    } finally {
      setBusyKeyId(null);
    }
  };

  const rotate = () => {
    const target = rotateTarget;
    if (!target) return;
    void runAction(
      target.id,
      async () => {
        const rotated = await endUsersApi.rotateKey(userId, target.id);
        setRotateTarget(null);
        showSecret(rotated.plaintext_key);
        notify({ type: "success", message: t("end_users.rotate_key_success") });
        await load();
      },
      t("api_keys_page.operation_failed"),
    );
  };

  const remove = () => {
    const target = deleteTarget;
    if (!target) return;
    void runAction(
      target.id,
      async () => {
        // 账号至少保留一把 Key 由后端在账号接口上保证。
        await endUsersApi.deleteKey(userId, target.id);
        setDeleteTarget(null);
        notify({ type: "success", message: t("api_keys_page.deleted_success") });
        await load();
      },
      t("api_keys_page.delete_failed"),
    );
  };

  const reset = (periods: QuotaResetPeriod[]) => {
    const target = resetTarget;
    if (!target || periods.length === 0) return;
    setResetError("");
    void runAction(
      target.id,
      async () => {
        try {
          await endUsersApi.resetKeyPeriodSpending(userId, target.id, periods);
        } catch (err) {
          setResetError(err instanceof Error ? err.message : t("api_keys_page.reset_period_spending_failed"));
          return;
        }
        setResetTarget(null);
        notify({ type: "success", message: t("api_keys_page.reset_period_spending_success") });
        await load();
      },
      t("api_keys_page.reset_period_spending_failed"),
    );
  };

  const openHistory = async (key: EndUserAPIKey) => {
    setHistoryTarget(key);
    setHistoryEvents([]);
    setHistoryLoading(true);
    try {
      const response = await endUsersApi.listKeyDailySpendingResetHistory(userId, key.id, 200);
      setHistoryEvents(Array.isArray(response?.items) ? response.items : []);
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : t("api_keys_page.reset_history_load_failed") });
      setHistoryTarget(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const viewUsage = async (key: EndUserAPIKey) => {
    setBusyKeyId(key.id);
    try {
      const plain = await resolveSecret(key);
      if (plain) onViewKeyUsage(key, plain);
    } finally {
      setBusyKeyId(null);
    }
  };

  const resetWindows = resetTarget
    ? resettableWindows(resetTarget["quota-limits"], resetTarget["model-rules"], resetTarget["quota-usage"])
    : [];
  const editing = editor?.mode === "edit" ? editor.key : null;

  return (
    <>
      <Modal
        open={Boolean(user)}
        onClose={onClose}
        title={user ? t("end_users.manage_keys_title_for", { name: endUserLabel(user) }) : t("end_users.manage_keys")}
        description={t("access_policy.keys_modal_desc")}
        icon={<KeyRound />}
        size="2xl"
        bodyHeightClassName="h-[min(42rem,calc(100dvh-12rem))]"
        bodyOverflowClassName="overflow-hidden"
        bodyClassName="!p-0"
        // 这里只是列表，改动都在里层弹窗里各自保存；点遮罩直接关闭。
        dirty={false}
      >
        <div className="flex h-full min-h-0 flex-col gap-3 px-6 pb-6 pt-1">
          {accountLimits ? (
            <div className={`${surface({ tone: "inset", radius: "2xl" })} flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3`}>
              <span className="shrink-0 text-xs font-semibold text-ink-2">{t("access_policy.account_ceiling")}</span>
              <QuotaUsageCell limits={accountLimits} usage={user?.["quota-usage"]?.total} max={4} className="min-w-0 flex-1 sm:grid-cols-4" />
            </div>
          ) : null}
          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="min-w-0 text-xs text-ink-3">{t("access_policy.keys_ceiling_hint")}</p>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                {t("api_keys_page.refresh")}
              </Button>
              {canWrite ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setServerError("");
                    setEditor({ mode: "create" });
                  }}
                >
                  <Plus size={14} />
                  {t("api_keys_page.create_key")}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <OwnedApiKeysTable
              t={t}
              tableId="end-user-owned-keys"
              keys={keys}
              busyKeyId={busyKeyId}
              busy={saving}
              loading={loading}
              height="min-h-0 flex-1"
              // 紧凑布局：密钥、状态并进名称格，弹窗宽度内放得下全部列，不用横向滚动。
              compact
              minWidth={policyCaps ? "min-w-[960px]" : "min-w-[820px]"}
              quotaLabel={policyCaps ? t("access_policy.col_quota") : undefined}
              canDelete={() => keys.length > 1}
              copyOnDemand
              renderQuota={
                policyCaps
                  ? (row) => <QuotaUsageCell limits={row["quota-limits"]} usage={row["quota-usage"]?.total} />
                  : undefined
              }
              canResetQuota={
                policyCaps ? (row) => resettableWindows(row["quota-limits"], row["model-rules"]).length > 0 : undefined
              }
              extraColumns={keyColumns}
              actions={{
                onViewUsage: (key) => void viewUsage(key),
                onCopy: (key) => void owned.copy(key),
                ...(canWrite
                  ? {
                      onToggleDisabled: (key: EndUserAPIKey) => void owned.toggleDisabled(key),
                      onRotate: setRotateTarget,
                      onEdit: (key: EndUserAPIKey) => {
                        setServerError("");
                        setEditor({ mode: "edit", key });
                      },
                      onResetPeriodSpending: (key: EndUserAPIKey) => {
                        setResetError("");
                        setResetTarget(key);
                      },
                      onDelete: setDeleteTarget,
                    }
                  : {}),
                onViewResetHistory: (key) => void openHistory(key),
              }}
            />
          </div>
        </div>
      </Modal>

      {user ? (
        <KeyPolicyModal
          open={editor !== null}
          mode={editor?.mode ?? "create"}
          // 外层弹窗已写明账号：编辑时只标出是哪把 Key，新建时标出 Key 建在哪个账号下。
          subtitle={editing ? editing.name || t("api_keys_page.unnamed") : endUserLabel(user)}
          initial={
            editing
              ? { name: editing.name, limits: editing["quota-limits"], rules: editing["model-rules"] }
              : undefined
          }
          ceiling={user["quota-limits"]}
          allowedModels={user["allowed-models"]}
          capabilities={{ accessPolicy: policyCaps, modelFallback: capabilities.modelFallback }}
          catalog={catalog}
          usage={editing?.["quota-usage"]}
          existingNames={keys.filter((key) => key.id !== editing?.id).map((key) => key.name)}
          saving={saving}
          serverError={serverError}
          onSubmit={(value) => void submitKey(value)}
          onClose={() => setEditor(null)}
        />
      ) : null}

      <ConfirmModal
        open={rotateTarget !== null}
        onClose={() => setRotateTarget(null)}
        title={t("end_users.rotate_key_title")}
        description={t("end_users.rotate_key_desc")}
        // 轮换换的是凭证、Key 本身还在：琥珀色 + 轮换图标，不用删除的红色。
        variant="warning"
        icon={<RotateCw />}
        subject={rotateTarget ? <span className="font-medium">{rotateTarget.name || t("api_keys_page.unnamed")}</span> : null}
        confirmText={t("end_users.rotate_key")}
        busy={busyKeyId === rotateTarget?.id}
        onConfirm={rotate}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t("api_keys_page.delete_key_title")}
        description={t("api_keys_page.delete_lead")}
        icon={<Trash2 />}
        subject={
          deleteTarget ? (
            <span className="flex min-w-0 items-center justify-between gap-3">
              <span className="truncate font-medium">{deleteTarget.name || t("api_keys_page.unnamed")}</span>
              <code className="shrink-0 font-mono text-xs text-ink-3">{deleteTarget.key_masked}</code>
            </span>
          ) : null
        }
        consequences={[t("api_keys_page.delete_consequence_clients")]}
        confirmText={t("api_keys_page.confirm_delete_btn")}
        busy={busyKeyId === deleteTarget?.id}
        onConfirm={remove}
      />

      <PeriodQuotaResetModal
        open={resetTarget !== null}
        scope="key"
        subjectName={resetTarget?.name?.trim() || t("api_keys_page.unnamed")}
        configuredLimits={resetTarget?.["period-spending-limits"]}
        periodSpendingItems={resetTarget?.["period-spending"]}
        windows={
          policyCaps
            ? resetWindows.map((item) => ({ period: item.window, description: describeWindowParts(t, item.parts) }))
            : undefined
        }
        busy={busyKeyId === resetTarget?.id}
        error={resetError}
        onClose={() => setResetTarget(null)}
        onConfirm={reset}
      />

      <SpendingResetHistoryModal
        open={historyTarget !== null}
        onClose={() => setHistoryTarget(null)}
        namespace="api_keys_page"
        title={t("api_keys_page.reset_history_title", { name: historyTarget?.name || t("api_keys_page.unnamed") })}
        description={t("api_keys_page.reset_history_desc", { key: historyTarget?.key_masked ?? "" })}
        loading={historyLoading}
        events={historyEvents}
      />

      <SecretRevealModal
        open={Boolean(secret)}
        onClose={() => setSecret(null)}
        title={t("end_users.copy_secret")}
        secret={secret ?? ""}
        secretLabel={t("api_keys_page.form_key_label")}
        warning={t("end_users.copy_secret_hint")}
      />
    </>
  );
}
