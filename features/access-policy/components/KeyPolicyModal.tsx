import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Gauge, KeyRound, Tag } from "lucide-react";
import {
  LEGACY_KEY_CELLS,
  emptyQuotaMatrix,
  type ModelRule,
  type QuotaMatrix,
  type QuotaUsageView,
} from "@code-proxy/api-client";
import { Button, FormField, Modal, TextInput } from "@code-proxy/ui";
import {
  draftToRules,
  matrixToDraft,
  parseMatrixDraft,
  ruleToDraft,
  type AccessPolicyDraft,
} from "../model/policyDraft";
import { issueSection, validatePolicyDraft } from "../model/policyValidation";
import type { ModelOption } from "./ModelPatternInput";
import { ModelRulesEditor } from "./ModelRulesEditor";
import { NavCountBadge, PolicyEditorLayout, type PolicyEditorSection } from "./PolicyEditorLayout";
import { QuotaMatrixEditor } from "./QuotaMatrixEditor";

export interface KeyPolicyValue {
  name: string;
  limits: QuotaMatrix;
  rules: ModelRule[];
}

interface KeyForm {
  name: string;
  policy: AccessPolicyDraft;
}

const toForm = (initial?: KeyPolicyValue): KeyForm => ({
  name: initial?.name ?? "",
  policy: {
    limits: matrixToDraft(initial?.limits ?? emptyQuotaMatrix()),
    rules: (initial?.rules ?? []).map(ruleToDraft),
    routes: [],
  },
});

/**
 * 新建 / 编辑账号名下的一把 Key：名称、子额度矩阵、Key 自己的按模型规则。
 *
 * 子额度每格都不能超过账号同一格（账号该格不限制时随意），格子下方常驻「≤ 账号上限」；
 * 留空表示这一格不单独限制，只受账号额度约束。路由只在账号 / 模板上配置，Key 上没有。
 * 旧后端只认识美元四周期，其余格子与规则都不显示。
 */
export function KeyPolicyModal({
  open,
  mode,
  subtitle,
  initial,
  ceiling,
  allowedModels,
  capabilities,
  catalog,
  usage,
  existingNames = [],
  saving,
  serverError,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  /** 写在标题下面的对象（Key 所属的账号、正在编辑的 Key）。 */
  subtitle?: ReactNode;
  initial?: KeyPolicyValue;
  /** 账号的生效额度（模板覆盖后）。 */
  ceiling: QuotaMatrix;
  /** 账号的生效模型白名单：降级模型必须在其中。 */
  allowedModels?: readonly string[];
  capabilities: { accessPolicy: boolean; modelFallback: boolean };
  catalog: readonly ModelOption[];
  usage?: QuotaUsageView;
  existingNames?: readonly string[];
  saving: boolean;
  serverError?: string;
  onSubmit: (value: KeyPolicyValue) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<KeyForm>(() => toForm(initial));
  const [section, setSection] = useState("basics");
  const [submitted, setSubmitted] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // 每次打开时在渲染期间用传入的初始值重置（effect 会晚一帧，先闪出上一把 Key 的值）；
  // 编辑过程中父组件重新渲染不能冲掉正在填写的内容。
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setForm(toForm(initial));
      setSection("basics");
      setSubmitted(false);
    }
  }

  const taken = useMemo(
    () => new Set(existingNames.map((name) => name.trim().toLowerCase())),
    [existingNames],
  );
  const nameIssue = !form.name.trim()
    ? t("validation.required")
    : taken.has(form.name.trim().toLowerCase())
      ? t("validation.duplicate_name")
      : "";
  const issues = useMemo(
    () =>
      validatePolicyDraft(form.policy, {
        editableCells: capabilities.accessPolicy ? undefined : LEGACY_KEY_CELLS,
        ceiling,
        allowedModels,
        rules: capabilities.accessPolicy,
        routes: false,
      }),
    [allowedModels, capabilities.accessPolicy, ceiling, form.policy],
  );
  const visibleIssues = submitted ? issues : {};
  const invalidSections = new Set(Object.keys(visibleIssues).map(issueSection));

  const submit = () => {
    setSubmitted(true);
    if (nameIssue) {
      setSection("basics");
      return;
    }
    const first = Object.keys(issues).map(issueSection).find(Boolean);
    if (first) {
      setSection(first === "limits" ? "limits" : "rules");
      return;
    }
    onSubmit({
      name: form.name.trim(),
      limits: parseMatrixDraft(form.policy.limits).matrix,
      rules: capabilities.accessPolicy ? draftToRules(form.policy.rules) : [],
    });
  };

  const setPolicy = (patch: Partial<AccessPolicyDraft>) =>
    setForm((current) => ({ ...current, policy: { ...current.policy, ...patch } }));

  const sections: PolicyEditorSection[] = [
    {
      id: "basics",
      group: "key",
      label: t("access_policy.key_section_basics"),
      icon: <Tag />,
      invalid: submitted && Boolean(nameIssue),
      title: t("access_policy.key_section_basics"),
      description: t("api_keys_page.owned_key_name_hint"),
      content: (
        <FormField label={t("api_keys_page.form_name_label")} required error={submitted ? nameIssue : undefined}>
          <TextInput
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder={t("api_keys_page.form_name_placeholder")}
            aria-label={t("api_keys_page.form_name_label")}
            aria-invalid={submitted && nameIssue ? true : undefined}
          />
        </FormField>
      ),
    },
    {
      id: "limits",
      group: "policy",
      label: t("access_policy.section_limits"),
      icon: <Gauge />,
      invalid: invalidSections.has("limits"),
      title: t("access_policy.key_limits_title"),
      description: t("access_policy.key_limits_desc"),
      content: (
        <QuotaMatrixEditor
          value={form.policy.limits}
          onChange={(limits) => setPolicy({ limits })}
          editableCells={capabilities.accessPolicy ? undefined : LEGACY_KEY_CELLS}
          ceiling={ceiling}
          usage={usage?.total}
          inFlight={usage?.["in-flight"]}
          issues={visibleIssues}
          idPrefix={`key-${mode}-limits`}
          label={t("access_policy.key_limits_title")}
        />
      ),
    },
  ];
  if (capabilities.accessPolicy) {
    sections.push({
      id: "rules",
      group: "policy",
      label: t("access_policy.section_rules"),
      icon: <Boxes />,
      badge: <NavCountBadge count={form.policy.rules.length} />,
      invalid: invalidSections.has("rules"),
      title: t("access_policy.section_rules"),
      description: t("access_policy.key_rules_desc"),
      content: (
        <ModelRulesEditor
          value={form.policy.rules}
          onChange={(rules) => setPolicy({ rules })}
          catalog={catalog}
          issues={visibleIssues}
          usage={usage}
          allowFallback={capabilities.modelFallback}
          idPrefix={`key-${mode}`}
        />
      ),
    });
  }

  const title = mode === "create" ? t("api_keys_page.create_key") : t("api_keys_page.edit_key_quota");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      hideHeader
      size="xl"
      bodyHeightClassName="h-[min(40rem,calc(100dvh-4rem))]"
      bodyOverflowClassName="overflow-hidden"
      bodyClassName="!p-0"
      onSubmitShortcut={submit}
    >
      <PolicyEditorLayout
        icon={<KeyRound />}
        title={title}
        subtitle={subtitle}
        groups={[
          { id: "key", label: t("access_policy.group_key") },
          { id: "policy", label: t("access_policy.group_policy") },
        ]}
        sections={sections}
        value={section}
        onChange={setSection}
        ariaLabel={t("access_policy.key_editor_nav")}
        sidebarNote={
          mode === "create" ? t("api_keys_page.owned_key_create_desc") : t("api_keys_page.owned_key_edit_desc")
        }
        footerStart={
          serverError ? (
            <p role="alert" className="text-xs leading-5 text-rose-600 dark:text-rose-400">
              {serverError}
            </p>
          ) : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={saving} onClick={submit}>
              {mode === "create" ? t("api_keys_page.create_btn") : t("api_keys_page.save_btn")}
            </Button>
          </>
        }
      />
    </Modal>
  );
}
