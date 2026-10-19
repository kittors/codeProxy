import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Gauge, ListFilter, Route, ShieldCheck, SlidersHorizontal, Tag } from "lucide-react";
import {
  LEGACY_PROFILE_CELLS,
  QUOTA_METRICS,
  QUOTA_WINDOWS,
  quotaCellKey,
  type AccessPolicyCapabilities,
  type QuotaCellKey,
} from "@code-proxy/api-client";
import {
  Button,
  FormField,
  Modal,
  TextInput,
  Textarea,
  rules,
  useFormValidation,
  type MultiSelectOption,
} from "@code-proxy/ui";
import {
  ModelRoutesEditor,
  ModelRulesEditor,
  NavCountBadge,
  PolicyEditorLayout,
  PolicyTester,
  QuotaMatrixEditor,
  issueSection,
  validatePolicyDraft,
  type ModelOption,
  type PolicyEditorSection,
} from "@features/access-policy";
import { AccessScopeFields } from "@features/api-key-restrictions";
import type { ProfileDraft } from "./profileDraft";

const RATE_FIELDS = ["concurrencyLimit", "rpmLimit", "tpmLimit"] as const;
const countRules = [rules.integer({ min: 0 })];

/** 模板拥有的格子：除累计消费（发给账号的额度）以外的全部。 */
const PROFILE_CELLS: ReadonlySet<QuotaCellKey> = new Set(
  QUOTA_METRICS.flatMap((metric) =>
    QUOTA_WINDOWS.flatMap((window) =>
      metric === "cost" && window === "lifetime" ? [] : [quotaCellKey(metric, window)],
    ),
  ),
);

type SectionId = "basics" | "limits" | "rules" | "routes" | "access" | "rate";

/**
 * 新增 / 编辑权限模板：额度矩阵、按模型规则、模型路由、访问范围、速率与系统提示词。
 *
 * 模板是成批管理账号权限的入口：保存后同步到所有绑定它的账号（后端在一个事务里完成，
 * 并把超出新额度的 Key 子额度自动压低）。累计消费不在模板里——那是发给每个账号的额度。
 * 旧后端只显示它能保存的格子，没有规则与路由。
 */
export function PermissionProfileFormModal({
  open,
  draft,
  setDraft,
  saving,
  capabilities,
  catalog,
  boundCount,
  availableChannelGroups,
  availableChannels,
  availableModels,
  onSubmit,
  onClose,
}: {
  open: boolean;
  draft: ProfileDraft;
  setDraft: Dispatch<SetStateAction<ProfileDraft>>;
  saving: boolean;
  capabilities: AccessPolicyCapabilities;
  catalog: readonly ModelOption[];
  /** 当前绑定这个模板的账号数（保存会同步到它们）。 */
  boundCount: number;
  availableChannelGroups: MultiSelectOption[];
  /** 已按所选渠道分组过滤过的渠道。 */
  availableChannels: MultiSelectOption[];
  availableModels: MultiSelectOption[];
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SectionId>("basics");
  const [submitted, setSubmitted] = useState(false);
  const policyCaps = capabilities.accessPolicy;
  const validation = useFormValidation(
    {
      name: draft.name,
      concurrencyLimit: draft.concurrencyLimit,
      rpmLimit: draft.rpmLimit,
      tpmLimit: draft.tpmLimit,
    },
    {
      name: [rules.required()],
      concurrencyLimit: countRules,
      rpmLimit: countRules,
      tpmLimit: countRules,
    },
  );
  const { reset } = validation;

  useEffect(() => {
    if (!open) return;
    reset();
    setSection("basics");
    setSubmitted(false);
  }, [open, reset]);

  const editableCells = policyCaps ? PROFILE_CELLS : LEGACY_PROFILE_CELLS;
  const issues = useMemo(
    () =>
      validatePolicyDraft(draft.policy, {
        editableCells,
        allowedModels: draft.access.allowedModels,
        rules: policyCaps,
        routes: policyCaps,
      }),
    [draft.access.allowedModels, draft.policy, editableCells, policyCaps],
  );
  const visibleIssues = submitted ? issues : {};
  const invalidSections = new Set(Object.keys(visibleIssues).map(issueSection));
  const unavailableCells = useMemo(
    () => new Map<QuotaCellKey, string>([["cost.lifetime", t("access_policy.profile_lifetime_unavailable")]]),
    [t],
  );

  const setPolicy = (patch: Partial<ProfileDraft["policy"]>) =>
    setDraft((current) => ({ ...current, policy: { ...current.policy, ...patch } }));

  const submit = () => {
    setSubmitted(true);
    const fieldsOk = validation.validate();
    if (!fieldsOk && "name" in validation.issues) {
      setSection("basics");
      return;
    }
    const first = Object.keys(issues).map(issueSection).find(Boolean);
    if (first) {
      setSection(first);
      return;
    }
    if (!fieldsOk) {
      setSection("rate");
      return;
    }
    onSubmit();
  };

  const sections: PolicyEditorSection[] = [
    {
      id: "basics",
      group: "profile",
      label: t("api_key_permissions_page.basics_section"),
      icon: <Tag />,
      invalid: submitted && "name" in validation.issues,
      title: t("api_key_permissions_page.basics_section"),
      description: t("access_policy.profile_basics_desc"),
      content: (
        <FormField
          label={t("api_key_permissions_page.form_name")}
          required
          description={t("api_key_permissions_page.form_name_hint")}
          error={validation.error("name")}
        >
          <TextInput
            value={draft.name}
            aria-label={t("api_key_permissions_page.form_name")}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t("api_key_permissions_page.form_name_placeholder")}
            {...validation.bind("name")}
          />
        </FormField>
      ),
    },
    {
      id: "limits",
      group: "quota",
      label: t("access_policy.section_limits"),
      icon: <Gauge />,
      invalid: invalidSections.has("limits"),
      title: t("access_policy.profile_limits_title"),
      description: t("access_policy.profile_limits_desc"),
      content: (
        <div>
          <QuotaMatrixEditor
            value={draft.policy.limits}
            onChange={(limits) => setPolicy({ limits })}
            editableCells={editableCells}
            unavailableCells={unavailableCells}
            issues={visibleIssues}
            idPrefix="profile-limits"
            label={t("access_policy.profile_limits_title")}
          />
          <p className="mt-4 text-2xs leading-5 text-ink-3">{t("access_policy.limits_input_hint")}</p>
        </div>
      ),
    },
  ];
  if (policyCaps) {
    sections.push(
      {
        id: "rules",
        group: "model",
        label: t("access_policy.section_rules"),
        icon: <Boxes />,
        badge: <NavCountBadge count={draft.policy.rules.length} />,
        invalid: invalidSections.has("rules"),
        title: t("access_policy.section_rules"),
        description: t("access_policy.rules_desc"),
        content: (
          <ModelRulesEditor
            value={draft.policy.rules}
            onChange={(next) => setPolicy({ rules: next })}
            catalog={catalog}
            issues={visibleIssues}
            allowFallback={capabilities.modelFallback}
            idPrefix="profile"
          />
        ),
      },
      {
        id: "routes",
        group: "model",
        label: t("access_policy.section_routes"),
        icon: <Route />,
        badge: <NavCountBadge count={draft.policy.routes.length} />,
        invalid: invalidSections.has("routes"),
        title: t("access_policy.section_routes"),
        description: t("access_policy.routes_desc"),
        content: (
          <div className="space-y-4">
            <ModelRoutesEditor
              value={draft.policy.routes}
              onChange={(next) => setPolicy({ routes: next })}
              catalog={catalog}
              issues={visibleIssues}
              idPrefix="profile"
            />
            {draft.policy.routes.length > 0 || draft.policy.rules.length > 0 ? (
              <PolicyTester routes={draft.policy.routes} rules={draft.policy.rules} catalog={catalog} />
            ) : null}
          </div>
        ),
      },
    );
  }
  sections.push(
    {
      id: "access",
      group: "access",
      label: t("access_policy.section_access"),
      icon: <ListFilter />,
      title: t("access_policy.section_access"),
      description: t("api_key_permissions_page.access_section_desc"),
      content: (
        <AccessScopeFields
          value={draft.access}
          onChange={(access) => setDraft((prev) => ({ ...prev, access }))}
          availableChannelGroups={availableChannelGroups}
          availableChannels={availableChannels}
          availableModels={availableModels}
        />
      ),
    },
    {
      id: "rate",
      group: "access",
      label: t("access_policy.section_rate_prompt"),
      icon: <SlidersHorizontal />,
      invalid: submitted && RATE_FIELDS.some((field) => field in validation.issues),
      title: t("access_policy.section_rate_prompt"),
      description: t("access_policy.rate_desc"),
      content: (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {RATE_FIELDS.map((field) => (
              <FormField key={field} label={t(`access_policy.rate.${field}`)} error={validation.error(field)} reserveMeta={false}>
                <TextInput
                  inputMode="numeric"
                  value={draft[field]}
                  placeholder={t("access_policy.unlimited_short")}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [field]: event.target.value }))}
                  {...validation.bind(field)}
                />
              </FormField>
            ))}
          </div>
          <FormField
            label={t("api_key_permissions_page.form_system_prompt")}
            optional
            description={t("api_key_permissions_page.system_prompt_hint")}
          >
            <Textarea
              value={draft.systemPrompt}
              // 标签里带「可选」字样，显式给名称，读屏和测试拿到的都是纯字段名。
              aria-label={t("api_key_permissions_page.form_system_prompt")}
              onChange={(event) => setDraft((prev) => ({ ...prev, systemPrompt: event.target.value }))}
              placeholder={t("api_key_permissions_page.system_prompt_placeholder")}
              rows={4}
            />
          </FormField>
        </div>
      ),
    },
  );

  const title = draft.id ? t("api_key_permissions_page.edit_config") : t("api_key_permissions_page.create_config");

  return (
    <Modal
      open={open}
      title={title}
      hideHeader
      size="2xl"
      bodyHeightClassName="h-[min(46rem,calc(100dvh-4rem))]"
      bodyOverflowClassName="overflow-hidden"
      bodyClassName="!p-0"
      onClose={onClose}
      onSubmitShortcut={submit}
    >
      <PolicyEditorLayout
        icon={<ShieldCheck />}
        title={title}
        subtitle={draft.name.trim() || undefined}
        groups={[
          { id: "profile", label: t("access_policy.group_profile") },
          { id: "quota", label: t("access_policy.group_quota") },
          { id: "model", label: t("access_policy.group_model") },
          { id: "access", label: t("access_policy.group_access") },
        ]}
        sections={sections}
        value={section}
        onChange={(id) => setSection(id as SectionId)}
        ariaLabel={t("access_policy.profile_editor_nav")}
        sidebarNote={
          draft.id && boundCount > 0
            ? t("access_policy.profile_sync_note", { count: boundCount })
            : t("access_policy.profile_new_note")
        }
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={saving} onClick={submit}>
              {t("api_key_permissions_page.save_config")}
            </Button>
          </>
        }
      />
    </Modal>
  );
}
