import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageSquareText,
  Pencil,
  Plus,
  Send,
  Trash2,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import type { AlertChannelKind } from "@code-proxy/api-client";
import { Button, EmptyState, ToggleSwitch, surface } from "@code-proxy/ui";
import { ChannelEditorModal } from "./ChannelEditorModal";
import { channelHasDestination, newChannelDraft, type ChannelDraft } from "./model";
import { TestResultLine } from "./TestResultLine";
import type { TestOutcome } from "./useChannelTest";

type T = ReturnType<typeof useTranslation>["t"];

const KIND_ICON: Record<AlertChannelKind, LucideIcon> = {
  webhook: Webhook,
  feishu: MessageSquareText,
  telegram: Send,
};

/** 一行底下的发送目标：只写打码后的地址和 Chat ID，不显示任何还没保存的明文。 */
function destinationText(channel: ChannelDraft, t: T) {
  if (channel.kind === "telegram") {
    if (channel.botToken.clear) return t("alerts_page.channel.dest_cleared");
    if (channel.chatId.trim() === "") return t("alerts_page.channel.dest_unset");
    return t("alerts_page.channel.dest_chat", { chat: channel.chatId.trim() });
  }
  if (channel.url.clear) return t("alerts_page.channel.dest_cleared");
  if (channel.url.input.trim() !== "") return t("alerts_page.channel.dest_new");
  return channel.url.masked || t("alerts_page.channel.dest_unset");
}

/**
 * 通知通道列表：增删改、启停和测试发送。所有改动先落在页面的草稿里，点页面上的「保存」才生效。
 * 只读（没有写权限，或后端没有设置库）时所有会改东西、会往外发消息的按钮都不可用。
 */
export function ChannelSection({
  channels,
  maxChannels,
  disabled,
  changedKeys,
  rowErrors,
  testPendingKey,
  testResults,
  onTest,
  onChange,
}: {
  channels: ChannelDraft[];
  maxChannels: number;
  /** 只读：没有写权限，或后端没有设置库。 */
  disabled: boolean;
  changedKeys: ReadonlySet<string>;
  /** 保存被后端退回时，按通道序号给出的原因。 */
  rowErrors: ReadonlyMap<number, string>;
  testPendingKey: string | null;
  testResults: Record<string, TestOutcome>;
  onTest: (channel: ChannelDraft) => void;
  onChange: (next: ChannelDraft[]) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<{ channel: ChannelDraft; isNew: boolean } | null>(null);
  const atLimit = channels.length >= maxChannels;

  const commit = (channel: ChannelDraft) => {
    onChange(
      channels.some((item) => item.key === channel.key)
        ? channels.map((item) => (item.key === channel.key ? channel : item))
        : [...channels, channel],
    );
    setEditing(null);
  };

  return (
    <section
      aria-labelledby="alerts-channels-title"
      className={`p-4 [--cp-inner-radius:var(--radius-lg)] ${surface({ radius: "3xl" })}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="alerts-channels-title"
            className="flex items-center gap-2 text-sm font-semibold text-ink"
          >
            {t("alerts_page.channels.title")}
            <span className="rounded-full bg-subtle px-2 py-px text-2xs font-medium tabular-nums text-ink-3">
              {channels.length} / {maxChannels}
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-ink-3">
            {t("alerts_page.channels.desc", { max: maxChannels })}
          </p>
        </div>
        <Button
          size="sm"
          variant="primary"
          disabled={disabled || atLimit}
          title={
            atLimit ? t("alerts_page.channels.limit_reached", { max: maxChannels }) : undefined
          }
          onClick={() => setEditing({ channel: newChannelDraft(), isNew: true })}
        >
          <Plus size={14} aria-hidden="true" />
          {t("alerts_page.channels.add")}
        </Button>
      </header>

      {channels.length === 0 ? (
        <EmptyState
          title={t("alerts_page.channels.empty_title")}
          description={t("alerts_page.channels.empty_desc")}
        />
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {channels.map((channel, index) => {
            const Icon = KIND_ICON[channel.kind];
            const name = channel.name.trim() || t("alerts_page.channel.unnamed");
            const rowError = rowErrors.get(index);
            return (
              <li key={channel.key} data-testid="alert-channel-row" className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-3"
                  >
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
                      <span className="truncate">{name}</span>
                      {changedKeys.has(channel.key) ? (
                        <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-px text-2xs font-medium text-amber-800 dark:text-amber-200">
                          {t("alerts_page.channel.unsaved")}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 break-all text-xs leading-5 text-ink-3">
                      {t(`alerts_page.kind.${channel.kind}`)} · {destinationText(channel, t)}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={channel.enabled}
                    disabled={disabled}
                    ariaLabel={t("alerts_page.channel.toggle", { name })}
                    onCheckedChange={(enabled) =>
                      onChange(
                        channels.map((item) =>
                          item.key === channel.key ? { ...item, enabled } : item,
                        ),
                      )
                    }
                  />
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        disabled || testPendingKey !== null || !channelHasDestination(channel)
                      }
                      aria-label={t("alerts_page.test.send_named", { name })}
                      onClick={() => onTest(channel)}
                    >
                      <Send size={14} aria-hidden="true" />
                      {t("alerts_page.test.send")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      aria-label={t("alerts_page.channel.edit_named", { name })}
                      title={t("common.edit")}
                      onClick={() => setEditing({ channel, isNew: false })}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost-danger"
                      disabled={disabled}
                      aria-label={t("alerts_page.channel.delete_named", { name })}
                      title={t("common.delete")}
                      onClick={() => onChange(channels.filter((item) => item.key !== channel.key))}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                {testResults[channel.key] || testPendingKey === channel.key ? (
                  <div className="mt-1.5 pl-11">
                    <TestResultLine
                      outcome={testResults[channel.key]}
                      pending={testPendingKey === channel.key}
                    />
                  </div>
                ) : null}
                {rowError ? (
                  <p className="mt-1.5 pl-11 text-xs text-rose-600 dark:text-rose-400">
                    {rowError}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ChannelEditorModal
        channel={editing?.channel ?? null}
        isNew={editing?.isNew ?? false}
        testPendingKey={testPendingKey}
        testResult={editing ? testResults[editing.channel.key] : undefined}
        onTest={onTest}
        onCommit={commit}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
