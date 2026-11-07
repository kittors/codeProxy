import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Boxes,
  Gauge,
  ListFilter,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserRound,
} from "lucide-react";
import {
  LEGACY_ACCOUNT_CELLS,
  type AccessPolicyCapabilities,
  type ApiKeyPermissionProfile,
  type EndUser,
  type EndUserUpdateBody,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  ChoiceCards,
  EmptyState,
  FormField,
  Modal,
  TextInput,
  Textarea,
  buttonClassName,
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
  ProfilePicker,
  QuotaMatrixEditor,
  issueSection,
  validatePolicyDraft,
  type ModelOption,
  type PolicyEditorSection,
} from "@features/access-policy";
import { AccessScopeFields } from "@features/api-key-restrictions";
import { displayNameRules, optionalPasswordRules } from "@features/identity-rules";
import {
  ACCOUNT_OWNED_CELLS,
  accountToForm,
  buildAccountUpdate,
  pickManagedPolicy,
  profileToManagedPolicy,
  type AccountEditForm,
  type ManagedPolicy,
  type PolicySource,
} from "../accountEditForm";
import { endUserLabel } from "../endUserForm";

const RATE_FIELDS = ["concurrencyLimit", "rpmLimit", "tpmLimit"] as const;
const countRules = [rules.integer({ min: 0 })];

/** 每个分区归属的导航组；资料单独一组，其余按「额度 / 模型 / 访问」分。 */
const SECTION_GROUP = {
  profile: "account",
  source: "account",
  limits: "quota",
  rules: "model",
  routes: "model",
  access: "access",
  rate: "access",
} as const;

type SectionId = keyof typeof SECTION_GROUP;

/**
 * 编辑门户账号：资料、权限来源、额度矩阵、按模型规则、模型路由、访问范围、速率与提示词。
 *
 * 模板是成批管理的主入口：选「使用权限模板」时其余各段只读、显示模板的值，改模板即同步全部
 * 绑定账号；只有累计消费额度属于账号本身，绑定时也能单独改。选「单独设置」时全部可改；从模板
 * 切过来时以模板当前的值为起点。误点一次模板再切回去，之前手填的值会恢复，不会丢。
 * 旧后端（没有声明 access-policy）只显示它能保存的格子，没有规则、路由与访问范围。
 */
export function EndUserEditModal({
  open,
  user,
  profiles,
  boundCounts,
  capabilities,
  catalog,
  availableChannelGroups,
  availableChannels,
  channelRouteGroupsByName,
  availableModels,
  onAccessScopeChange,
  saving,
  serverError,
  onSubmit,
  onClose,
}: {
  open: boolean;
  user: EndUser | null;
  profiles: ApiKeyPermissionProfile[];
  boundCounts: ReadonlyMap<string, number>;
  capabilities: AccessPolicyCapabilities;
  catalog: readonly ModelOption[];
  availableChannelGroups: MultiSelectOption[];
  availableChannels: MultiSelectOption[];
  channelRouteGroupsByName: Record<string, string[]>;
  availableModels: MultiSelectOption[];
  /** 渠道范围变化时刷新可选模型（只列出这些渠道能提供的模型）。 */
  onAccessScopeChange: (channels: string[], groups: string[]) => void;
  saving: boolean;
  serverError?: string;
  onSubmit: (body: EndUserUpdateBody) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AccountEditForm | null>(null);
  const [initial, setInitial] = useState<AccountEditForm | null>(null);
  const [stash, setStash] = useState<ManagedPolicy | null>(null);
  const [section, setSection] = useState<SectionId>("profile");
  const [submitted, setSubmitted] = useState(false);
  const [session, setSession] = useState<{ open: boolean; userId?: string }>({ open: false });
  const policyCaps = capabilities.accessPolicy;

  // 打开（或换了一个账号）时在渲染期间重置表单，而不是等 effect：effect 晚一帧，打开的第一帧
  // 会闪出空白或上一个账号的值。列表刷新带来的新对象（同一个 id）不能冲掉正在编辑的内容。
  if (session.open !== open || (open && session.userId !== user?.id)) {
    setSession({ open, userId: user?.id });
    if (open && user) {
      const next = accountToForm(user);
      setForm(next);
      setInitial(next);
      setStash(null);
      setSection("profile");
      setSubmitted(false);
    }
  }

  const scopeChannels = form?.access.useExactChannels ? form.access.allowedChannels : [];
  const scopeGroups = form?.access.allowedChannelGroups ?? [];
  const scopeKey = `${scopeChannels.join(",")}|${scopeGroups.join(",")}`;
  useEffect(() => {
    if (!open || !policyCaps) return;
    onAccessScopeChange(scopeChannels, scopeGroups);
    // 按渠道范围的取值触发，避免数组身份变化引起重复请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, policyCaps, scopeKey]);

  const validation = useFormValidation(
    {
      displayName: form?.displayName ?? "",
      username: form?.username ?? "",
      password: form?.password ?? "",
      concurrencyLimit: form?.concurrencyLimit ?? "",
      rpmLimit: form?.rpmLimit ?? "",
      tpmLimit: form?.tpmLimit ?? "",
    },
    {
      displayName: displayNameRules,
      // 门户用户名后端只做小写化与重名自动加后缀，没有字符集限制，所以只要求非空。
      username: [rules.required()],
      password: optionalPasswordRules,
      concurrencyLimit: countRules,
      rpmLimit: countRules,
      tpmLimit: countRules,
    },
  );
  const { reset } = validation;
  useEffect(() => {
    if (open) reset();
  }, [open, user?.id, reset]);

  const bound = form?.source === "template";
  const selectedProfile = bound
    ? (profiles.find((profile) => profile.id === form?.permissionProfileId) ?? null)
    : null;

  const filteredChannels = useMemo(() => {
    const groups = form?.access.allowedChannelGroups ?? [];
    if (!form?.access.useExactChannels || groups.length === 0) return availableChannels;
    const allowed = new Set(groups.map((group) => group.toLowerCase()));
    return availableChannels.filter((option) =>
      (channelRouteGroupsByName[option.value] ?? []).some((group) => allowed.has(group)),
    );
  }, [availableChannels, channelRouteGroupsByName, form?.access.allowedChannelGroups, form?.access.useExactChannels]);

  const policyIssues = useMemo(
    () =>
      form
        ? validatePolicyDraft(form.policy, {
            editableCells: bound ? ACCOUNT_OWNED_CELLS : policyCaps ? undefined : LEGACY_ACCOUNT_CELLS,
            allowedModels: bound ? undefined : form.access.allowedModels,
            rules: policyCaps && !bound,
            routes: policyCaps && !bound,
          })
        : {},
    [bound, form, policyCaps],
  );

  if (!form || !user) {
    return (
      <Modal open={open} onClose={onClose} title={t("end_users.edit")} hideHeader size="2xl">
        {null}
      </Modal>
    );
  }

  const update = (patch: Partial<AccountEditForm>) => setForm((current) => (current ? { ...current, ...patch } : current));
  const setPolicy = (patch: Partial<AccountEditForm["policy"]>) =>
    setForm((current) => (current ? { ...current, policy: { ...current.policy, ...patch } } : current));

  const applyProfile = (profileId: string) => {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    // 第一次从「单独设置」切到模板时记下手填的值，切回去时恢复。
    if (form.source === "custom" && !stash) setStash(pickManagedPolicy(form));
    update({
      source: "template",
      permissionProfileId: profileId,
      ...profileToManagedPolicy(profile, form.policy.limits.cost.lifetime),
    });
  };

  const changeSource = (source: PolicySource) => {
    if (source === form.source) return;
    if (source === "template") {
      const target = form.permissionProfileId || profiles[0]?.id;
      if (target) applyProfile(target);
      else update({ source: "template" });
      return;
    }
    // 切回单独设置：有之前手填的值就恢复，否则以模板当前的值为起点继续改。累计消费在绑定
    // 模板期间也能改，以当前值为准，不被暂存的旧值覆盖。
    if (stash) {
      const limits = { ...stash.policy.limits, cost: { ...stash.policy.limits.cost, lifetime: form.policy.limits.cost.lifetime } };
      update({ source: "custom", ...stash, policy: { ...stash.policy, limits } });
    } else {
      update({ source: "custom" });
    }
    setStash(null);
  };

  const profileMissing = bound && !selectedProfile;
  const identityInvalid = ["displayName", "username", "password"].some(
    (field) => field in validation.issues,
  );
  const rateInvalid = RATE_FIELDS.some((field) => field in validation.issues);
  const visiblePolicyIssues = submitted ? policyIssues : {};
  const invalidSections = new Set<string | null>(Object.keys(visiblePolicyIssues).map(issueSection));

  const submit = () => {
    setSubmitted(true);
    const identityOk = validation.validate();
    const order: Array<[SectionId, boolean]> = [
      ["profile", !identityOk && identityInvalid],
      ["source", profileMissing],
      ["limits", Object.keys(policyIssues).some((path) => issueSection(path) === "limits")],
      ["rules", Object.keys(policyIssues).some((path) => issueSection(path) === "rules")],
      ["routes", Object.keys(policyIssues).some((path) => issueSection(path) === "routes")],
      ["rate", rateInvalid],
    ];
    const firstInvalid = order.find(([, invalid]) => invalid);
    if (firstInvalid) {
      setSection(firstInvalid[0]);
      return;
    }
    onSubmit(buildAccountUpdate(user, form, profiles, capabilities));
  };

  const readOnlyNote = selectedProfile ? (
    <Callout tone="info" icon={<ShieldCheck />} className="mb-4">
      {t("access_policy.managed_by_profile", { profile: selectedProfile.name })}
    </Callout>
  ) : null;

  const sections: PolicyEditorSection[] = [
    {
      id: "profile",
      group: SECTION_GROUP.profile,
      label: t("end_users.profile_section"),
      icon: <UserRound />,
      invalid: submitted && identityInvalid,
      title: t("end_users.profile_section"),
      content: (
        <div className="space-y-4">
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <FormField label={t("end_users.display_name")} required error={validation.error("displayName")}>
              <TextInput
                value={form.displayName}
                onChange={(event) => update({ displayName: event.target.value })}
                {...validation.bind("displayName")}
              />
            </FormField>
            <FormField label={t("end_users.username")} required error={validation.error("username")}>
              <TextInput
                value={form.username}
                onChange={(event) => update({ username: event.target.value })}
                autoComplete="off"
                spellCheck={false}
                {...validation.bind("username")}
              />
            </FormField>
          </div>
          <FormField
            label={t("end_users.new_password_label")}
            optional
            description={t("end_users.new_password_hint")}
            error={validation.error("password")}
          >
            <TextInput
              type="password"
              value={form.password}
              onChange={(event) => update({ password: event.target.value })}
              autoComplete="new-password"
              {...validation.bind("password")}
            />
          </FormField>
        </div>
      ),
    },
    {
      id: "source",
      group: SECTION_GROUP.source,
      label: t("access_policy.section_source"),
      icon: <ShieldCheck />,
      invalid: submitted && profileMissing,
      title: t("access_policy.section_source"),
      description: t("access_policy.source_desc"),
      content: (
        <div className="space-y-4">
          <ChoiceCards<PolicySource>
            value={form.source}
            onChange={changeSource}
            ariaLabel={t("access_policy.section_source")}
            options={[
              {
                value: "template",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {t("access_policy.source_template")}
                    <span className="rounded-full bg-ink/[0.05] px-1.5 py-0.5 text-2xs font-medium text-ink-2 dark:bg-white/[0.07] colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-300">
                      {t("access_policy.recommended")}
                    </span>
                  </span>
                ),
                description: t("access_policy.source_template_desc"),
                icon: <ShieldCheck />,
              },
              {
                value: "custom",
                label: t("access_policy.source_custom"),
                description: t("access_policy.source_custom_desc"),
                icon: <SlidersHorizontal />,
              },
            ]}
          />
          {form.source === "template" ? (
            profiles.length > 0 ? (
              <>
                <ProfilePicker
                  profiles={profiles}
                  value={form.permissionProfileId}
                  onChange={applyProfile}
                  boundCounts={boundCounts}
                  ariaLabel={t("access_policy.pick_profile")}
                />
                {submitted && profileMissing ? (
                  <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                    {t("access_policy.profile_required")}
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={<ShieldCheck size={28} />}
                title={t("access_policy.no_profiles_title")}
                description={t("access_policy.no_profiles_desc")}
                action={
                  <Link
                    to="/access/api-key-permissions"
                    className={buttonClassName({ size: "sm", variant: "secondary" })}
                  >
                    {t("access_policy.go_to_profiles")}
                  </Link>
                }
              />
            )
          ) : (
            <Callout tone="neutral" icon={<SlidersHorizontal />}>
              {initial?.source === "template"
                ? t("access_policy.custom_from_profile_hint")
                : t("access_policy.custom_hint")}
            </Callout>
          )}
        </div>
      ),
    },
    {
      id: "limits",
      group: SECTION_GROUP.limits,
      label: t("access_policy.section_limits"),
      icon: <Gauge />,
      invalid: invalidSections.has("limits"),
      title: t("access_policy.account_limits_title"),
      description: t("access_policy.account_limits_desc"),
      content: (
        <div>
          {readOnlyNote}
          <QuotaMatrixEditor
            value={form.policy.limits}
            onChange={(limits) => setPolicy({ limits })}
            editableCells={bound ? ACCOUNT_OWNED_CELLS : policyCaps ? undefined : LEGACY_ACCOUNT_CELLS}
            usage={user["quota-usage"]?.total}
            inFlight={user["quota-usage"]?.["in-flight"]}
            issues={visiblePolicyIssues}
            idPrefix="account-limits"
            label={t("access_policy.account_limits_title")}
          />
          <p className="mt-4 text-2xs leading-5 text-ink-3">{t("access_policy.limits_input_hint")}</p>
          {user["quota-usage"]?.["five-hour-resets-at"] ? (
            <p className="mt-1 text-2xs leading-5 text-ink-3">
              {t("access_policy.five_hour_resets_at", {
                time: new Date(user["quota-usage"]["five-hour-resets-at"]).toLocaleString(),
              })}
            </p>
          ) : null}
        </div>
      ),
    },
  ];

  if (policyCaps) {
    sections.push(
      {
        id: "rules",
        group: SECTION_GROUP.rules,
        label: t("access_policy.section_rules"),
        icon: <Boxes />,
        badge: <NavCountBadge count={form.policy.rules.length} />,
        invalid: invalidSections.has("rules"),
        title: t("access_policy.section_rules"),
        description: t("access_policy.rules_desc"),
        content: (
          <div>
            {readOnlyNote}
            <ModelRulesEditor
              value={form.policy.rules}
              onChange={bound ? undefined : (next) => setPolicy({ rules: next })}
              readOnly={bound}
              catalog={catalog}
              issues={visiblePolicyIssues}
              usage={user["quota-usage"]}
              allowFallback={capabilities.modelFallback}
              idPrefix="account"
            />
          </div>
        ),
      },
      {
        id: "routes",
        group: SECTION_GROUP.routes,
        label: t("access_policy.section_routes"),
        icon: <Route />,
        badge: <NavCountBadge count={form.policy.routes.length} />,
        invalid: invalidSections.has("routes"),
        title: t("access_policy.section_routes"),
        description: t("access_policy.routes_desc"),
        content: (
          <div className="space-y-4">
            {readOnlyNote}
            <ModelRoutesEditor
              value={form.policy.routes}
              onChange={bound ? undefined : (next) => setPolicy({ routes: next })}
              readOnly={bound}
              catalog={catalog}
              issues={visiblePolicyIssues}
              idPrefix="account"
            />
            {form.policy.routes.length > 0 || form.policy.rules.length > 0 ? (
              <PolicyTester routes={form.policy.routes} rules={form.policy.rules} catalog={catalog} />
            ) : null}
          </div>
        ),
      },
      {
        id: "access",
        group: SECTION_GROUP.access,
        label: t("access_policy.section_access"),
        icon: <ListFilter />,
        title: t("access_policy.section_access"),
        description: t("access_policy.access_desc"),
        content: (
          <div>
            {readOnlyNote}
            <AccessScopeFields
              value={form.access}
              onChange={bound ? undefined : (access) => update({ access })}
              readOnly={bound}
              availableChannelGroups={availableChannelGroups}
              availableChannels={filteredChannels}
              availableModels={availableModels}
            />
          </div>
        ),
      },
    );
  }

  sections.push({
    id: "rate",
    group: SECTION_GROUP.rate,
    label: policyCaps ? t("access_policy.section_rate_prompt") : t("access_policy.section_rate"),
    icon: <SlidersHorizontal />,
    invalid: submitted && rateInvalid,
    title: policyCaps ? t("access_policy.section_rate_prompt") : t("access_policy.section_rate"),
    description: t("access_policy.rate_desc"),
    content: (
      <div className="space-y-5">
        {readOnlyNote}
        <div className="grid gap-4 sm:grid-cols-3">
          {RATE_FIELDS.map((field) => (
            <FormField
              key={field}
              label={t(`access_policy.rate.${field}`)}
              error={validation.error(field)}
              reserveMeta={false}
            >
              <TextInput
                inputMode="numeric"
                value={form[field]}
                placeholder={t("access_policy.unlimited_short")}
                disabled={bound}
                onChange={(event) => update({ [field]: event.target.value } as Partial<AccountEditForm>)}
                {...validation.bind(field)}
              />
            </FormField>
          ))}
        </div>
        {policyCaps ? (
          <FormField
            label={t("api_key_permissions_page.form_system_prompt")}
            optional
            description={t("api_key_permissions_page.system_prompt_hint")}
          >
            <Textarea
              value={form.systemPrompt}
              aria-label={t("api_key_permissions_page.form_system_prompt")}
              placeholder={t("api_key_permissions_page.system_prompt_placeholder")}
              disabled={bound}
              rows={4}
              onChange={(event) => update({ systemPrompt: event.target.value })}
            />
          </FormField>
        ) : null}
      </div>
    ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("end_users.edit")}
      hideHeader
      size="2xl"
      bodyHeightClassName="h-[min(46rem,calc(100dvh-4rem))]"
      bodyOverflowClassName="overflow-hidden"
      bodyClassName="!p-0"
      onSubmitShortcut={submit}
    >
      <PolicyEditorLayout
        icon={<UserCog />}
        title={t("end_users.edit")}
        subtitle={endUserLabel(user)}
        groups={[
          { id: "account", label: t("access_policy.group_account") },
          { id: "quota", label: t("access_policy.group_quota") },
          { id: "model", label: t("access_policy.group_model") },
          { id: "access", label: t("access_policy.group_access") },
        ]}
        sections={sections}
        value={section}
        onChange={(id) => setSection(id as SectionId)}
        ariaLabel={t("access_policy.account_editor_nav")}
        sidebarNote={
          selectedProfile
            ? t("access_policy.footer_profile", { profile: selectedProfile.name })
            : t("access_policy.footer_custom")
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
            <Button onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={saving} onClick={submit}>
              {t("common.save")}
            </Button>
          </>
        }
      />
    </Modal>
  );
}
