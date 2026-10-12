import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Callout,
  FormField,
  Modal,
  SearchableSelect,
  Tabs,
  TabsList,
  TabsTrigger,
  TextInput,
  rules,
  useFormValidation,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import {
  CC_SWITCH_CLIENTS,
  getCcSwitchClientConfig,
  type CcSwitchClientType,
} from "@code-proxy/domain/ccswitch/ccswitchClients";
import { normalizeCcSwitchRoutePath } from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import { resolveCcSwitchImportPlan } from "@code-proxy/domain/ccswitch/ccswitchImportPlan";
import { CcSwitchClientIcon } from "./CcSwitchClientIcon";
import { CcSwitchImportPreview } from "./CcSwitchImportPreview";
import { CcSwitchModelFields } from "./CcSwitchModelFields";
import {
  getPrimaryModel,
  prepareDraftForSave,
  seedModels,
  setChannelGroup,
  setClientType,
  type ConfigDraft,
} from "./ccswitchConfigDraft";
import { useChannelGroupModels, type CcSwitchChannelGroupOption } from "./useChannelGroupModels";

const FORM_ID = "ccswitch-config-form";

const routeLabel = (routePath: string | undefined) => normalizeCcSwitchRoutePath(routePath) || "/";

/**
 * Creates or edits a CC Switch preset: an app, a channel group (which fixes the route the
 * import points at), a name and the models — only what CC Switch actually reads. The right
 * column renders what the desktop app will write, from the same plan the import link uses.
 *
 * `clientTypes` are the apps the backend accepts. An existing preset keeps its app: clients
 * already imported from it depend on its route and model names.
 *
 * Once a group's models arrive, a model selection that is still empty is filled: the main /
 * default model becomes the admin's own pick when the group serves it (an existing preset's
 * model counts as one), otherwise the app's usual first choice.
 */
export function CcSwitchImportConfigModal({
  open,
  mode,
  value,
  baseUrl,
  channelGroupOptions,
  channelGroupsLoading,
  clientTypes,
  codexContextWindowSupported,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit";
  value: ConfigDraft;
  baseUrl: string;
  channelGroupOptions: CcSwitchChannelGroupOption[];
  channelGroupsLoading: boolean;
  clientTypes: readonly CcSwitchClientType[];
  /** The backend stores a preset-level `codex-context-window`. */
  codexContextWindowSupported: boolean;
  onClose: () => void;
  onSave: (value: ConfigDraft) => void;
}) {
  const { t, i18n } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const appLabelId = useId();
  const [draft, setDraft] = useState<ConfigDraft>(value);
  // Set when the model selection should be refilled from the group once its models arrive.
  const [seedPending, setSeedPending] = useState(false);
  // The main / default model the admin chose; a suggestion never replaces it.
  const [pickedPrimary, setPickedPrimary] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setSeedPending(false);
    setPickedPrimary(mode === "edit" ? getPrimaryModel(value) : "");
  }, [mode, open, value]);

  const selectedGroup = draft.allowedChannelGroups[0] ?? "";
  const savedGroup = value.allowedChannelGroups[0] ?? "";
  const selectedGroupOption = channelGroupOptions.find((option) => option.value === selectedGroup);
  const {
    models: groupModels,
    loading: modelsLoading,
    loadedGroup,
  } = useChannelGroupModels(open, selectedGroup, selectedGroupOption);

  useEffect(() => {
    if (!seedPending || !selectedGroup || modelsLoading || loadedGroup !== selectedGroup) return;
    setDraft((current) => seedModels(current, groupModels, pickedPrimary));
    setSeedPending(false);
  }, [seedPending, selectedGroup, modelsLoading, loadedGroup, groupModels, pickedPrimary]);

  const primaryModel = getPrimaryModel(draft);
  const validation = useFormValidation(
    { group: selectedGroup, providerName: draft.providerName, primaryModel },
    {
      group: [rules.required()],
      providerName: [rules.required()],
      primaryModel: [rules.required()],
    },
  );
  const { reset } = validation;
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const prepared = useMemo(() => prepareDraftForSave(draft), [draft]);
  const plan = useMemo(
    () =>
      resolveCcSwitchImportPlan({
        apiKey: "",
        baseUrl,
        config: prepared,
        usageLanguage: i18n.language,
      }),
    [baseUrl, i18n.language, prepared],
  );

  const clientLabel = t(getCcSwitchClientConfig(draft.clientType).labelKey);
  const tabClients = CC_SWITCH_CLIENTS.filter(
    (client) => clientTypes.includes(client.type) || client.type === draft.clientType,
  );

  const groupOptions = useMemo<SearchableSelectOption[]>(() => {
    const options: SearchableSelectOption[] = channelGroupOptions.map((option) => {
      const path = routeLabel(option.routePath);
      return {
        value: option.value,
        triggerLabel: (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">{option.label}</span>
            <span className="shrink-0 font-mono text-xs text-ink-3">{path}</span>
          </span>
        ),
        searchText: `${option.label} ${path} ${option.description ?? ""}`,
        label: (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-ink">{option.label}</span>
            <span className="truncate font-mono text-xs text-ink-3">
              {path}
              {option.description ? ` · ${option.description}` : ""}
            </span>
          </span>
        ),
      };
    });
    // A saved group that the list hides (implicit groups other than "default") stays
    // selectable, so editing such a preset does not silently drop its group.
    if (selectedGroup && !channelGroupOptions.some((option) => option.value === selectedGroup)) {
      const hiddenLabel = `${selectedGroup} ${t("ccswitch.config_channel_group_hidden")}`;
      options.push({
        value: selectedGroup,
        triggerLabel: <span>{hiddenLabel}</span>,
        searchText: hiddenLabel,
        label: <span>{hiddenLabel}</span>,
      });
    }
    return options;
  }, [channelGroupOptions, selectedGroup, t]);

  const changeGroup = (group: string) => {
    setDraft((current) => setChannelGroup(current, group, value.routePath));
    setSeedPending(Boolean(group));
  };

  const changeClientType = (clientType: CcSwitchClientType) => {
    const crossesClaude = (draft.clientType === "claude") !== (clientType === "claude");
    setDraft((current) => setClientType(current, clientType));
    // Claude Code tiers and the other apps' model lists do not carry over; start fresh.
    if (crossesClaude) {
      setPickedPrimary("");
      if (selectedGroup) setSeedPending(true);
    }
  };

  const submit = () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    onSave(prepared);
  };

  return (
    <Modal
      open={open}
      title={t(mode === "create" ? "ccswitch.config_modal_create" : "ccswitch.config_modal_edit")}
      description={
        mode === "create"
          ? t("ccswitch.config_modal_description")
          : t("ccswitch.config_modal_edit_description", { client: clientLabel })
      }
      icon={<CcSwitchClientIcon clientType={draft.clientType} className="h-5 w-5" />}
      size="xl"
      bodyHeightClassName="max-h-[78vh]"
      onClose={onClose}
      onSubmitShortcut={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary">
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {mode === "create" ? (
          <div className="space-y-2.5">
            <div id={appLabelId} className="text-sm font-medium text-ink">
              {t("ccswitch.config_app")}
            </div>
            <Tabs
              value={draft.clientType}
              onValueChange={(next) => changeClientType(next as CcSwitchClientType)}
            >
              <TabsList aria-labelledby={appLabelId}>
                {tabClients.map((client) => (
                  <TabsTrigger key={client.type} value={client.type}>
                    <CcSwitchClientIcon clientType={client.type} />
                    {t(client.labelKey)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        ) : null}

        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form
            ref={formRef}
            id={FORM_ID}
            noValidate
            className="min-w-0"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="space-y-4">
              <FormField
                label={t("ccswitch.config_channel_group")}
                required
                description={t("ccswitch.config_channel_group_hint")}
                error={validation.error("group")}
              >
                <SearchableSelect
                  value={selectedGroup}
                  onChange={changeGroup}
                  options={groupOptions}
                  placeholder={
                    channelGroupsLoading
                      ? t("ccswitch.config_channel_groups_loading")
                      : t("ccswitch.config_channel_groups_placeholder")
                  }
                  searchPlaceholder={t("ccswitch.config_channel_groups_search_placeholder")}
                  className="w-full"
                />
              </FormField>
              {mode === "edit" && savedGroup && selectedGroup !== savedGroup ? (
                <Callout tone="warning">{t("ccswitch.config_channel_group_changed")}</Callout>
              ) : null}
              <FormField
                label={t("ccswitch.config_name")}
                required
                description={t("ccswitch.config_name_hint")}
                error={validation.error("providerName")}
              >
                <TextInput
                  value={draft.providerName}
                  onChange={(event) => {
                    const providerName = event.currentTarget.value;
                    setDraft((current) => ({ ...current, providerName }));
                  }}
                  {...validation.bind("providerName")}
                />
              </FormField>
              {plan.nameAdjustment ? (
                <Callout tone="warning">
                  {t(
                    plan.nameAdjustment === "gemini-official-auth"
                      ? "ccswitch.config_name_gemini_adjusted"
                      : "ccswitch.config_name_reference_adjusted",
                    { name: plan.name, client: clientLabel },
                  )}
                </Callout>
              ) : null}
              <FormField label={t("ccswitch.config_remark")} optional reserveMeta={false}>
                <TextInput
                  value={draft.note}
                  onChange={(event) => {
                    const note = event.currentTarget.value;
                    setDraft((current) => ({ ...current, note }));
                  }}
                  placeholder={t("ccswitch.config_remark_placeholder")}
                />
              </FormField>
            </div>

            <CcSwitchModelFields
              draft={draft}
              groupModels={groupModels}
              modelsLoading={modelsLoading}
              groupSelected={Boolean(selectedGroup)}
              primaryError={validation.error("primaryModel")}
              codexContextWindowSupported={codexContextWindowSupported}
              onChange={(update) => setDraft(update)}
              onPrimaryPicked={setPickedPrimary}
            />
          </form>

          <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
            {selectedGroup ? (
              <CcSwitchImportPreview plan={plan} />
            ) : (
              // Without a group there is no route yet, so an endpoint here would be wrong.
              <p
                data-testid="ccswitch-import-preview-pending"
                className="rounded-2xl bg-subtle px-4 py-6 text-center text-sm text-ink-3"
              >
                {t("ccswitch.preview_pending_group")}
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
