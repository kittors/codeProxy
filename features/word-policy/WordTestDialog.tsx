import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import type { WordTestResult as WordTestOutcome } from "@code-proxy/api-client";
import { Button, Callout, FormField, Modal, Textarea } from "@code-proxy/ui";
import { WordTestResult } from "./WordTestResult";

export interface WordTestDialogProps {
  open: boolean;
  /** 测的是未保存的草稿还是已保存的规则：只影响说明文字。 */
  usesDraft: boolean;
  /** 说明这次会检查哪些规则（管理端带上其它层级，门户只有账号自己的）。 */
  description: string;
  run: (input: string) => Promise<WordTestOutcome>;
  onClose: () => void;
}

/**
 * 测试敏感词：粘贴一段文本，看它会被拦截、改写还是放行，并高亮每一处命中。
 * 不保存、不发给任何上游；⌘/Ctrl + Enter 也能运行。
 */
export function WordTestDialog({ open, usesDraft, description, run, onClose }: WordTestDialogProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<{ input: string; result: WordTestOutcome } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setInput("");
    setOutcome(null);
    setError("");
  }, [open]);

  const start = async () => {
    if (!input.trim() || running) return;
    setRunning(true);
    setOutcome(null);
    setError("");
    // 原样发送、不 trim：返回的命中位置是相对这段文本的，改动一个字符就会错位。
    const sent = input;
    try {
      setOutcome({ input: sent, result: await run(sent) });
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : t("content_moderation.test_failed"),
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("content_moderation.words.test_title")}
      description={description}
      icon={<FlaskConical />}
      size="lg"
      onSubmitShortcut={() => void start()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button variant="primary" loading={running} disabled={!input.trim()} onClick={() => void start()}>
            <FlaskConical size={14} />
            {t("content_moderation.words.test_run")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {usesDraft ? (
          <Callout tone="info">{t("content_moderation.words.test_uses_draft")}</Callout>
        ) : null}
        <FormField label={t("content_moderation.words.test_input_label")}>
          <Textarea
            value={input}
            rows={5}
            placeholder={t("content_moderation.words.test_input_placeholder")}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
        </FormField>
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
        {outcome ? <WordTestResult input={outcome.input} result={outcome.result} /> : null}
      </div>
    </Modal>
  );
}
