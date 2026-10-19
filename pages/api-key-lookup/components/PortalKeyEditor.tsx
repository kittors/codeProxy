import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  emptyQuotaMatrix,
  portalApi,
  quotaMatrixEquals,
  quotaMatrixToPatch,
  type AccessPolicyCapabilities,
  type EndUser,
  type EndUserAPIKey,
  type EndUserAPIKeyMutationBody,
} from "@code-proxy/api-client";
import { KeyPolicyModal, formatAccessPolicyError, type KeyPolicyValue, type ModelOption } from "@features/access-policy";
import { formatQuotaValidationError } from "@features/period-spending";

export type PortalKeyEditorState = { mode: "create" } | { mode: "edit"; key: EndUserAPIKey } | null;

/**
 * 门户里新建 / 编辑自己的 Key：名称、子额度矩阵与 Key 自己的按模型规则（后端支持时）。
 * 子额度每格不能超过账号同一格；账号的额度与路由由管理员在账号或模板上配置。
 */
export function PortalKeyEditor({
  state,
  account,
  keys,
  capabilities,
  catalog,
  busy,
  onBusyChange,
  onCreated,
  onSaved,
  onClose,
}: {
  state: PortalKeyEditorState;
  account: EndUser | null;
  keys: EndUserAPIKey[];
  capabilities: AccessPolicyCapabilities;
  catalog: readonly ModelOption[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onCreated: (response: { api_key: EndUserAPIKey; plaintext_key?: string }) => Promise<void>;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState("");
  const editing = state?.mode === "edit" ? state.key : null;
  const policyCaps = capabilities.accessPolicy;

  const submit = async (value: KeyPolicyValue) => {
    const body: EndUserAPIKeyMutationBody = {};
    if (!editing || value.name !== editing.name) body.name = value.name;
    if (policyCaps) {
      if (!editing || !quotaMatrixEquals(value.limits, editing["quota-limits"])) {
        body["quota-limits"] = quotaMatrixToPatch(value.limits);
      }
      if (!editing || JSON.stringify(value.rules) !== JSON.stringify(editing["model-rules"])) {
        body["model-rules"] = value.rules;
      }
    } else {
      body["daily-spending-limit"] = value.limits.cost.day;
      body["period-spending-limits"] = {
        "5h": value.limits.cost["5h"],
        day: value.limits.cost.day,
        week: value.limits.cost.week,
        month: value.limits.cost.month,
      };
    }
    onBusyChange(true);
    setServerError("");
    try {
      if (editing) {
        if (Object.keys(body).length > 0) await portalApi.updateKey(editing.id, body);
        onClose();
        await onSaved();
      } else {
        const response = await portalApi.createKey(body);
        onClose();
        await onCreated(response);
      }
    } catch (err) {
      setServerError(formatAccessPolicyError(err, t) ?? formatQuotaValidationError(err, t));
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <KeyPolicyModal
      open={state !== null}
      mode={state?.mode ?? "create"}
      initial={editing ? { name: editing.name, limits: editing["quota-limits"], rules: editing["model-rules"] } : undefined}
      ceiling={account?.["quota-limits"] ?? emptyQuotaMatrix()}
      allowedModels={account?.["allowed-models"]}
      capabilities={{ accessPolicy: policyCaps, modelFallback: capabilities.modelFallback }}
      catalog={catalog}
      usage={editing?.["quota-usage"]}
      existingNames={keys.filter((key) => key.id !== editing?.id).map((key) => key.name || "")}
      saving={busy}
      serverError={serverError}
      onSubmit={(value) => void submit(value)}
      onClose={() => {
        if (busy) return;
        setServerError("");
        onClose();
      }}
    />
  );
}
