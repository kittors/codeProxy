import { useTranslation } from "react-i18next";
import { Eraser, ListChecks, ShieldX, Undo2 } from "lucide-react";
import type { WordAction, WordPolicyLimits, WordPolicyView } from "@code-proxy/api-client";
import { ChoiceCards, FormField, TextInput, type ChoiceCardOption } from "@code-proxy/ui";
import type { WordPolicyDraft } from "./wordPolicyModel";

/** 「跟随租户」在选项里的占位值；落到草稿里就是空串。 */
const INHERIT = "inherit";
type ActionChoice = WordAction | typeof INHERIT;

export interface WordActionPickerProps {
  draft: WordPolicyDraft;
  view: WordPolicyView;
  limits: Pick<WordPolicyLimits, "max_replacement_chars" | "max_block_message_chars">;
  /** Key 层可以「跟随租户」：不设自己的处理方式，用租户策略的。 */
  inheritable: boolean;
  readOnly: boolean;
  onChange: (patch: Partial<WordPolicyDraft>) => void;
}

/**
 * 命中后怎么处理：拦截 / 替换 / 仅记录，三张卡片摊开写清楚各自的后果，不用点开下拉猜。
 * 只有当前方式用得上的那一项输入（拦截提示、替换文本）跟在下面，其余收起来。
 *
 * 平台、租户和门户账号层没有「跟随」：空设置按生效值显示，草稿里仍保持空值，
 * 用户没点过的设置保存后依旧跟着默认值走（见 WordPolicyDraft 的说明）。
 */
export function WordActionPicker({
  draft,
  view,
  limits,
  inheritable,
  readOnly,
  onChange,
}: WordActionPickerProps) {
  const { t } = useTranslation();
  const effective = view.effective;
  const resolved: WordAction = draft.action || effective.action;
  const selected: ActionChoice = inheritable && draft.action === "" ? INHERIT : resolved;

  const options: ChoiceCardOption<ActionChoice>[] = [
    ...(inheritable
      ? [
          {
            value: INHERIT as ActionChoice,
            label: t("content_moderation.words.action_inherit"),
            description: t("content_moderation.words.action_inherit_hint", {
              action: t(`content_moderation.words.action_${effective.action}`),
            }),
            icon: <Undo2 />,
          },
        ]
      : []),
    {
      value: "block",
      label: t("content_moderation.words.action_block"),
      description: t("content_moderation.words.action_block_hint"),
      icon: <ShieldX />,
    },
    {
      value: "replace",
      label: t("content_moderation.words.action_replace"),
      description: t("content_moderation.words.action_replace_hint"),
      icon: <Eraser />,
    },
    {
      value: "log",
      label: t("content_moderation.words.action_log"),
      description: t("content_moderation.words.action_log_hint"),
      icon: <ListChecks />,
    },
  ];

  return (
    <div className="space-y-3">
      <ChoiceCards<ActionChoice>
        value={selected}
        columns={inheritable ? 2 : 3}
        disabled={readOnly}
        ariaLabel={t("content_moderation.words.setting_action")}
        options={options}
        onChange={(next) => onChange({ action: next === INHERIT ? "" : next })}
      />

      {resolved === "block" ? (
        <FormField
          label={t("content_moderation.words.setting_block_message")}
          description={t("content_moderation.words.setting_block_message_hint")}
          optional
        >
          <TextInput
            value={draft.blockMessage}
            disabled={readOnly}
            maxLength={limits.max_block_message_chars}
            placeholder={effective.block_message}
            onChange={(event) => onChange({ blockMessage: event.currentTarget.value })}
          />
        </FormField>
      ) : null}

      {resolved === "replace" ? (
        <>
          <FormField
            label={t("content_moderation.words.setting_replacement")}
            description={t("content_moderation.words.setting_replacement_hint")}
            optional
          >
            <TextInput
              value={draft.replacement}
              disabled={readOnly}
              maxLength={limits.max_replacement_chars}
              placeholder={effective.replacement}
              onChange={(event) => onChange({ replacement: event.currentTarget.value })}
            />
          </FormField>
          {/* 替换做不到的情形要说在前面：那时请求会被拦下，而不是带着敏感词放行。 */}
          <p className="text-xs leading-5 text-ink-3">{t("content_moderation.words.setting_action_replace_note")}</p>
        </>
      ) : null}
    </div>
  );
}
