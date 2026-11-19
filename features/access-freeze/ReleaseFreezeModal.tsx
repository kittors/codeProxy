import { useEffect, useState } from "react";
import { Unlock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { accessFreezesApi, type AccessFreeze } from "@code-proxy/api-client";
import { Callout, ConfirmModal, FormField, ProviderTag, Textarea, useToast } from "@code-proxy/ui";
import {
  RELEASE_NOTE_MAX_LENGTH,
  describeFreezeError,
  freezeProviderName,
  isFreezeGone,
} from "./format";

/**
 * 解冻一条冻结。确认框里写明解冻会怎样（被冻结方立即能再用这个上游、拒绝次数重新累计），备注选填、
 * 留在冻结记录上。
 *
 * 解冻成功，或者发现冻结已经不在了（别人先解冻了、记录被清理）时，调用 onChanged 让调用方重新读取，
 * 再关掉自己；其他失败留在框里、可以直接重试。
 */
export function ReleaseFreezeModal({
  freeze,
  subjectName,
  onClose,
  onChanged,
}: {
  freeze: AccessFreeze | null;
  /** 被冻结方在界面上的称呼（账号昵称、Key 名称）。 */
  subjectName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 换一条冻结，或重新打开，都从空白开始：上一条的备注和报错不该带过来。
  const freezeId = freeze?.id ?? null;
  useEffect(() => {
    setNote("");
    setError("");
  }, [freezeId]);

  const provider = freeze ? freezeProviderName(t, freeze) : "";

  const release = async () => {
    if (!freeze) return;
    setBusy(true);
    setError("");
    try {
      await accessFreezesApi.release(freeze.id, note);
      notify({ type: "success", message: t("access_freeze.release_success", { provider }) });
      onChanged();
      onClose();
    } catch (err) {
      if (isFreezeGone(err)) {
        // 界面上的数据过期了：不用让人重试，刷新之后它会如实显示现在的状态。
        notify({
          type: "info",
          message: describeFreezeError(t, err, t("access_freeze.release_failed")),
        });
        onChanged();
        onClose();
        return;
      }
      setError(describeFreezeError(t, err, t("access_freeze.release_failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      open={freeze !== null}
      onClose={onClose}
      title={t("access_freeze.release_title")}
      description={t("access_freeze.release_lead")}
      variant="primary"
      icon={<Unlock />}
      subject={
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="truncate font-medium">{subjectName}</span>
          <ProviderTag vendor={freeze?.provider} withLogo>
            {provider}
          </ProviderTag>
        </span>
      }
      consequences={[
        // 门户账号冻结的是名下所有 Key，Key 自己的冻结只涉及这一把。
        t(
          freeze?.subject.kind === "api_key"
            ? "access_freeze.release_consequence_resume_api_key"
            : "access_freeze.release_consequence_resume_end_user",
          { subject: subjectName, provider },
        ),
        t("access_freeze.release_consequence_strikes"),
      ]}
      confirmText={t("access_freeze.release_action")}
      busy={busy}
      onConfirm={() => void release()}
    >
      <FormField
        label={t("access_freeze.release_note_label")}
        optional
        description={t("access_freeze.release_note_hint")}
        valueLength={note.length}
        maxLength={RELEASE_NOTE_MAX_LENGTH}
        reserveMeta={false}
      >
        <Textarea
          value={note}
          rows={3}
          maxLength={RELEASE_NOTE_MAX_LENGTH}
          placeholder={t("access_freeze.release_note_placeholder")}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
      </FormField>
      {error ? (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      ) : null}
    </ConfirmModal>
  );
}
