import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp } from "lucide-react";
import {
  WORD_VALIDATE_MAX_RULES,
  wordPolicyApi,
  type WordPolicyLimits,
  type WordPolicyScope,
  type WordRuleKind,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  FormField,
  Modal,
  SegmentedControl,
  Textarea,
  surface,
} from "@code-proxy/ui";
import {
  parseRuleFile,
  reviewImport,
  type DraftRule,
  type ImportReview,
} from "./wordPolicyModel";

/** 词表文本文件的上限：两万行、每行几十字也远小于它；再大多半选错了文件。 */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** 预览里最多列出多少条不合格的行，其余只给个数。 */
const PROBLEM_PREVIEW_LIMIT = 50;

export interface WordImportModalProps {
  open: boolean;
  scope: WordPolicyScope;
  keyId: string;
  limits: WordPolicyLimits;
  /** 草稿里现有的规则：用来判断哪些导入项重复，以及加上之后放不放得下。 */
  rules: readonly DraftRule[];
  onClose: () => void;
  onImport: (rules: DraftRule[]) => void;
}

const readTextFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file, "utf-8");
  });

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className={`${surface({ tone: "inset", radius: "xl" })} px-3 py-2.5`}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd
        className={[
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "danger" && value > 0 ? "text-rose-600 dark:text-rose-400" : "text-ink",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * 从文本文件（或粘贴的文字）批量导入规则：一行一条，先检查再导入。
 *
 * 不内置任何词库：词表由用户自己提供。检查由服务端按保存时同样的规则逐行审核
 * （正则能不能编译、过长、空行），预览里列出不合格的行号和原因，以及重复的、已经有的、放不放得下，
 * 确认后只把新规则加进草稿——和手动添加一样，点「保存」才真正生效，不满意可以丢弃草稿。
 */
export function WordImportModal({
  open,
  scope,
  keyId,
  limits,
  rules,
  onClose,
  onImport,
}: WordImportModalProps) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<WordRuleKind>("keyword");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [problem, setProblem] = useState("");
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<ImportReview | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind("keyword");
    setText("");
    setFileName("");
    setProblem("");
    setChecking(false);
    setReview(null);
  }, [open]);

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setReview(null);
    setProblem("");
    if (file.size > MAX_FILE_BYTES) {
      setProblem(t("content_moderation.words.import_file_too_large"));
      return;
    }
    try {
      const content = await readTextFile(file);
      // 不是 UTF-8（例如 GBK 的中文词表）读出来会是一堆 U+FFFD，导进去就是一批乱码关键词。
      if (content.includes("\uFFFD")) {
        setProblem(t("content_moderation.words.import_not_utf8"));
        return;
      }
      setText(content);
      setFileName(file.name);
    } catch {
      setProblem(t("content_moderation.words.import_read_failed"));
    }
  };

  const check = async () => {
    if (checking) return;
    setReview(null);
    setProblem("");
    const parsed = parseRuleFile(text, kind, WORD_VALIDATE_MAX_RULES);
    if (parsed.lines.length === 0) {
      setProblem(t("content_moderation.words.import_nothing"));
      return;
    }
    if (parsed.tooMany) {
      setProblem(t("content_moderation.words.import_too_many", { max: WORD_VALIDATE_MAX_RULES }));
      return;
    }
    setChecking(true);
    try {
      const result = await wordPolicyApi.validate({
        scope,
        ...(scope === "key" ? { key_id: keyId } : {}),
        rules: parsed.lines.map((line) => ({ kind, pattern: line.text })),
      });
      setReview(reviewImport({ lines: parsed.lines, kind, result, draftRules: rules, limits }));
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : t("content_moderation.words.validate_failed"),
      );
    } finally {
      setChecking(false);
    }
  };

  const canImport = review !== null && review.fresh.length > 0 && review.fits && !checking;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("content_moderation.words.import_title")}
      description={t("content_moderation.words.import_description")}
      icon={<FileUp />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void check()}
            loading={checking}
            disabled={text.trim() === ""}
          >
            {t("content_moderation.words.import_check")}
          </Button>
          <Button
            variant="primary"
            disabled={!canImport}
            onClick={() => {
              if (review) onImport(review.fresh);
            }}
          >
            {t("content_moderation.words.import_confirm", { count: review?.fresh.length ?? 0 })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Callout tone="info">{t("content_moderation.words.import_format")}</Callout>

        <FormField label={t("content_moderation.words.field_kind")}>
          <SegmentedControl<WordRuleKind>
            value={kind}
            ariaLabel={t("content_moderation.words.import_kind")}
            options={[
              { value: "keyword", label: t("content_moderation.words.kind_keyword") },
              { value: "regex", label: t("content_moderation.words.kind_regex") },
            ]}
            onChange={(next) => {
              setKind(next);
              setReview(null);
              setProblem("");
            }}
          />
        </FormField>

        <FormField
          label={t("content_moderation.words.import_text")}
          description={
            fileName
              ? t("content_moderation.words.import_loaded", { name: fileName })
              : t("content_moderation.words.import_text_hint")
          }
        >
          <div className="space-y-2">
            <div>
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.list,.csv,text/plain"
                className="sr-only"
                tabIndex={-1}
                aria-label={t("content_moderation.words.import_file_input")}
                data-testid="word-import-file"
                onChange={(event) => {
                  const input = event.currentTarget;
                  void chooseFile(input.files?.[0]).finally(() => {
                    // 允许再次选同一个文件。
                    input.value = "";
                  });
                }}
              />
              <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
                <FileUp size={14} />
                {t("content_moderation.words.import_choose_file")}
              </Button>
            </div>
            <Textarea
              value={text}
              onChange={(event) => {
                setText(event.currentTarget.value);
                setFileName("");
                setReview(null);
                setProblem("");
              }}
              spellCheck={false}
              placeholder={t("content_moderation.words.import_placeholder")}
              aria-label={t("content_moderation.words.import_text")}
              className="min-h-32 font-mono text-xs"
            />
          </div>
        </FormField>

        {problem ? (
          <Callout tone="danger" role="alert">
            {problem}
          </Callout>
        ) : null}

        {review ? (
          <section className="space-y-3" aria-live="polite" aria-label={t("content_moderation.words.import_result")}>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t("content_moderation.words.import_stat_new")} value={review.fresh.length} />
              <Stat
                label={t("content_moderation.words.import_stat_duplicate")}
                value={review.duplicateInFile + review.alreadyPresent}
              />
              <Stat
                label={t("content_moderation.words.import_stat_invalid")}
                value={review.invalid.length}
                tone="danger"
              />
              <Stat label={t("content_moderation.words.import_stat_total")} value={review.total} />
            </dl>

            {!review.fits ? (
              <Callout tone="danger" role="alert">
                {t("content_moderation.words.import_over_limit", {
                  rules: review.rulesAfter,
                  maxRules: limits.max_rules,
                  regex: review.regexAfter,
                  maxRegex: limits.max_regex,
                })}
              </Callout>
            ) : review.fresh.length === 0 ? (
              <Callout tone="warning">{t("content_moderation.words.import_none_new")}</Callout>
            ) : (
              <Callout tone="success">
                {t("content_moderation.words.import_ready", { count: review.fresh.length })}
              </Callout>
            )}

            {review.invalid.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-ink">
                  {t("content_moderation.words.import_invalid_title", {
                    count: review.invalid.length,
                  })}
                </p>
                <div className={`max-h-52 overflow-y-auto ${surface({ tone: "inset", radius: "xl" })}`}>
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-subtle text-ink-3">
                      <tr>
                        <th className="px-3 py-2 font-semibold">
                          {t("content_moderation.words.import_col_line")}
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          {t("content_moderation.words.col_pattern")}
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          {t("content_moderation.words.import_col_problem")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {review.invalid.slice(0, PROBLEM_PREVIEW_LIMIT).map((item) => (
                        <tr key={`${item.line}:${item.text}`} className="border-t border-line align-top">
                          <td className="px-3 py-2 tabular-nums text-ink-3">{item.line}</td>
                          <td className="max-w-48 truncate px-3 py-2 font-mono text-ink-2" title={item.text}>
                            {item.text}
                          </td>
                          <td className="px-3 py-2 text-rose-600 dark:text-rose-400">{item.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {review.invalid.length > PROBLEM_PREVIEW_LIMIT ? (
                  <p className="text-xs text-ink-3">
                    {t("content_moderation.words.import_more_problems", {
                      count: review.invalid.length - PROBLEM_PREVIEW_LIMIT,
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
