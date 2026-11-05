import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import type { AlertChannelKind } from "@code-proxy/api-client";
import {
  Button,
  FormField,
  Modal,
  Select,
  SettingGroup,
  SettingRow,
  TextInput,
  ToggleSwitch,
} from "@code-proxy/ui";
import { channelHasDestination, secretIsSet, type ChannelDraft } from "./model";
import { SecretField } from "./SecretField";
import { TestResultLine } from "./TestResultLine";
import type { TestOutcome } from "./useChannelTest";

const KINDS: AlertChannelKind[] = ["webhook", "feishu", "telegram"];

/**
 * 添加 / 编辑一个通道。「完成」只是把它放进页面的草稿，回到页面点「保存」才真正生效；
 * 「发送测试消息」发的是弹窗里这份草稿（还没保存也能试）。
 */
export function ChannelEditorModal({
  channel,
  isNew,
  testPendingKey,
  testResult,
  onTest,
  onCommit,
  onClose,
}: {
  /** null 表示关闭。 */
  channel: ChannelDraft | null;
  isNew: boolean;
  /** 正在发送测试的通道（页面上同一时间只允许一个）；null 表示没有。 */
  testPendingKey: string | null;
  testResult: TestOutcome | undefined;
  onTest: (channel: ChannelDraft) => void;
  onCommit: (channel: ChannelDraft) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ChannelDraft | null>(channel);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!channel) return;
    setDraft(channel);
    setSubmitted(false);
  }, [channel]);

  const current = draft ?? channel;
  const open = channel !== null && current !== null;
  const patch = (next: Partial<ChannelDraft>) =>
    setDraft((value) => (value ? { ...value, ...next } : value));

  const telegram = current?.kind === "telegram";
  const missingName = current ? current.name.trim() === "" : false;
  const missingAddress = current && !telegram ? !secretIsSet(current.url) : false;
  const missingToken = current && telegram ? !secretIsSet(current.botToken) : false;
  const missingChatId = current && telegram ? current.chatId.trim() === "" : false;
  const invalid = missingName || missingAddress || missingToken || missingChatId;

  const commit = () => {
    setSubmitted(true);
    if (!current || invalid) return;
    onCommit(current);
  };

  return (
    <Modal
      open={open}
      title={isNew ? t("alerts_page.channel.add_title") : t("alerts_page.channel.edit_title")}
      description={t("alerts_page.channel.modal_desc")}
      icon={<Send />}
      size="md"
      onClose={onClose}
      onSubmitShortcut={commit}
      footerStart={
        <span className="text-xs text-ink-3">{t("alerts_page.channel.draft_note")}</span>
      }
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={commit}>
            {t("alerts_page.channel.commit")}
          </Button>
        </>
      }
    >
      {current ? (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            commit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("alerts_page.channel.kind")} reserveMeta={false}>
              {isNew ? (
                <Select
                  value={current.kind}
                  onChange={(value) => patch({ kind: value as AlertChannelKind })}
                  options={KINDS.map((kind) => ({
                    value: kind,
                    label: t(`alerts_page.kind.${kind}`),
                  }))}
                  fullWidth
                />
              ) : (
                // 已保存通道的类型不能改：三种通道的字段和已存的密钥都不通用。
                <TextInput readOnly value={t(`alerts_page.kind.${current.kind}`)} />
              )}
            </FormField>
            <FormField
              label={t("alerts_page.channel.name")}
              required
              description={t("alerts_page.channel.name_hint")}
              error={submitted && missingName ? t("alerts_page.channel.name_required") : undefined}
              reserveMeta={false}
            >
              <TextInput
                value={current.name}
                maxLength={64}
                autoComplete="off"
                placeholder={t("alerts_page.channel.name_placeholder")}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </FormField>
          </div>

          {current.kind === "telegram" ? (
            <>
              <FormField
                label={t("alerts_page.channel.bot_token")}
                required
                description={t("alerts_page.channel.bot_token_hint")}
                error={
                  submitted && missingToken
                    ? t("alerts_page.channel.bot_token_required")
                    : undefined
                }
                reserveMeta={false}
              >
                <SecretField
                  sensitive
                  value={current.botToken}
                  placeholder="123456789:AA…"
                  onChange={(botToken) => patch({ botToken })}
                />
              </FormField>
              <FormField
                label={t("alerts_page.channel.chat_id")}
                required
                description={t("alerts_page.channel.chat_id_hint")}
                error={
                  submitted && missingChatId ? t("alerts_page.channel.chat_id_required") : undefined
                }
                reserveMeta={false}
              >
                <TextInput
                  value={current.chatId}
                  autoComplete="off"
                  inputMode="text"
                  placeholder="-1001234567890"
                  onChange={(event) => patch({ chatId: event.target.value })}
                />
              </FormField>
            </>
          ) : (
            <>
              <FormField
                label={t(`alerts_page.channel.url_${current.kind}`)}
                required
                description={t(`alerts_page.channel.url_${current.kind}_hint`)}
                error={
                  submitted && missingAddress ? t("alerts_page.channel.url_required") : undefined
                }
                reserveMeta={false}
              >
                <SecretField
                  value={current.url}
                  placeholder={
                    current.kind === "feishu"
                      ? "https://open.feishu.cn/open-apis/bot/v2/hook/…"
                      : "https://hooks.example.com/…"
                  }
                  onChange={(url) => patch({ url })}
                />
              </FormField>
              <FormField
                label={t("alerts_page.channel.secret")}
                optional
                description={t(`alerts_page.channel.secret_${current.kind}_hint`)}
                reserveMeta={false}
              >
                <SecretField
                  sensitive
                  value={current.secret}
                  placeholder={t("alerts_page.channel.secret_placeholder")}
                  onChange={(secret) => patch({ secret })}
                />
              </FormField>
            </>
          )}

          <SettingGroup flat>
            <SettingRow
              label={t("alerts_page.channel.enabled")}
              description={t("alerts_page.channel.enabled_hint")}
              controlWidth="auto"
              control={
                <ToggleSwitch
                  checked={current.enabled}
                  ariaLabel={t("alerts_page.channel.enabled")}
                  onCheckedChange={(enabled) => patch({ enabled })}
                />
              }
            />
          </SettingGroup>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onTest(current)}
              disabled={testPendingKey !== null || !channelHasDestination(current)}
            >
              <Send size={14} aria-hidden="true" />
              {t("alerts_page.test.send")}
            </Button>
            <TestResultLine outcome={testResult} pending={testPendingKey === current.key} />
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
