import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListFilter } from "lucide-react";
import {
  wordPolicyApi,
  type WordPolicyLimits,
  type WordPolicyScope,
  type WordRuleKind,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  CheckboxField,
  Form,
  FormField,
  Modal,
  SegmentedControl,
  TextInput,
  ToggleSwitch,
} from "@code-proxy/ui";
import {
  isOnlySeparators,
  ruleIdentity,
  ruleIdentityOf,
  type DraftRule,
  type WordRuleFields,
} from "./wordPolicyModel";

export interface WordRuleModalProps {
  open: boolean;
  /** null 表示新增。 */
  rule: DraftRule | null;
  scope: WordPolicyScope;
  keyId: string;
  /** 草稿里的全部规则，用来在本地提示重复。 */
  rules: readonly DraftRule[];
  limits: WordPolicyLimits;
  onClose: () => void;
  onSubmit: (fields: WordRuleFields) => void;
}

const FORM_ID = "word-rule-form";

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

/**
 * 新增 / 编辑一条规则。
 *
 * 关键词的长度、正则的字节数在本地就能判断；正则是否合法只有服务端知道（Go 的 RE2 与浏览器的
 * 正则语法不同，本地编译只会给出错误的结论），所以提交时先问服务端「这条规则能不能存」，
 * 不合法就把原因写在输入框下面，而不是等到整份策略保存时才被拒。
 */
export function WordRuleModal({
  open,
  rule,
  scope,
  keyId,
  rules,
  limits,
  onClose,
  onSubmit,
}: WordRuleModalProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<WordRuleKind>("keyword");
  const [pattern, setPattern] = useState("");
  const [note, setNote] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [ignoreSeparators, setIgnoreSeparators] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind(rule?.kind ?? "keyword");
    setPattern(rule?.pattern ?? "");
    setNote(rule?.note ?? "");
    setEnabled(rule?.enabled ?? true);
    setIgnoreSeparators(rule?.kind !== "regex" && rule?.ignore_separators === true);
    setChecking(false);
    setError("");
    setFailure("");
  }, [open, rule]);

  const submit = async () => {
    if (checking) return;
    setError("");
    setFailure("");
    // 关键词两端的空白没有意义；正则的空白可能是模式的一部分，只去掉换行。
    const value = kind === "keyword" ? pattern.trim() : pattern.replace(/[\r\n]+$/, "");
    if (value.trim() === "") {
      setError(t("content_moderation.words.error_empty"));
      return;
    }
    if (kind === "keyword" && [...value].length > limits.max_keyword_chars) {
      setError(t("content_moderation.words.error_keyword_too_long", { max: limits.max_keyword_chars }));
      return;
    }
    if (kind === "regex" && utf8Length(value) > limits.max_regex_bytes) {
      setError(t("content_moderation.words.error_regex_too_long", { max: limits.max_regex_bytes }));
      return;
    }
    // 只有关键词能忽略分隔符；弹窗里切到正则时这个选项已被清掉，这里再兜一次，不把它带给正则。
    const loose = kind === "keyword" && ignoreSeparators;
    if (loose && isOnlySeparators(value)) {
      setError(t("content_moderation.words.error_only_separators"));
      return;
    }
    const identity = ruleIdentity(kind, value, loose);
    if (rules.some((other) => other.key !== rule?.key && ruleIdentityOf(other) === identity)) {
      setError(t("content_moderation.words.error_duplicate"));
      return;
    }
    if (kind === "regex") {
      const regexCount = rules.filter((other) => other.kind === "regex" && other.key !== rule?.key).length;
      if (regexCount + 1 > limits.max_regex) {
        setError(t("content_moderation.words.error_too_many_regex", { max: limits.max_regex }));
        return;
      }
    }
    // 改的只是备注或开关时，规则本身没变，不必再问服务端。
    const unchanged =
      rule !== null &&
      rule.kind === kind &&
      rule.pattern === value &&
      (rule.ignore_separators === true) === loose;
    if (!unchanged) {
      setChecking(true);
      try {
        const verdict = await wordPolicyApi.validate({
          scope,
          ...(scope === "key" ? { key_id: keyId } : {}),
          rules: [{ kind, pattern: value, ...(loose ? { ignore_separators: true } : {}) }],
        });
        const invalid = verdict.reviews.find((review) => review.status === "invalid");
        if (invalid) {
          setError(invalid.problem?.message || t("content_moderation.words.error_invalid"));
          return;
        }
      } catch (requestError) {
        setFailure(
          requestError instanceof Error
            ? requestError.message
            : t("content_moderation.words.validate_failed"),
        );
        return;
      } finally {
        setChecking(false);
      }
    }
    onSubmit({ kind, pattern: value, note: note.trim(), enabled, ignoreSeparators: loose });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rule ? t("content_moderation.words.edit_rule") : t("content_moderation.words.add_rule")}
      icon={<ListFilter />}
      size="md"
      onSubmitShortcut={() => void submit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={checking}>
            {t("common.cancel")}
          </Button>
          {/* 提交按钮挂在表单上：这样在输入框里回车也能保存（与其它弹窗一致）。 */}
          <Button type="submit" form={FORM_ID} variant="primary" loading={checking}>
            {rule ? t("common.save") : t("content_moderation.words.add_rule")}
          </Button>
        </>
      }
    >
      <Form
        id={FORM_ID}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label={t("content_moderation.words.field_kind")}>
          <SegmentedControl<WordRuleKind>
            value={kind}
            ariaLabel={t("content_moderation.words.field_kind")}
            options={[
              { value: "keyword", label: t("content_moderation.words.kind_keyword") },
              { value: "regex", label: t("content_moderation.words.kind_regex") },
            ]}
            onChange={(next) => {
              setKind(next);
              // 忽略分隔符只对关键词有意义；换成正则就清掉，换回来也不替用户记着。
              if (next === "regex") setIgnoreSeparators(false);
              setError("");
            }}
          />
        </FormField>

        <FormField
          label={t("content_moderation.words.field_pattern")}
          description={
            kind === "regex"
              ? t("content_moderation.words.field_pattern_regex_hint")
              : t("content_moderation.words.field_pattern_keyword_hint")
          }
          error={error || undefined}
          required
        >
          <TextInput
            value={pattern}
            onChange={(event) => {
              setPattern(event.currentTarget.value);
              setError("");
            }}
            className={kind === "regex" ? "font-mono" : undefined}
            placeholder={
              kind === "regex"
                ? t("content_moderation.words.field_pattern_regex_placeholder")
                : t("content_moderation.words.field_pattern_keyword_placeholder")
            }
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>

        {kind === "keyword" ? (
          <CheckboxField
            checked={ignoreSeparators}
            label={t("content_moderation.words.field_ignore_separators")}
            description={t("content_moderation.words.field_ignore_separators_hint")}
            onCheckedChange={(next) => {
              setIgnoreSeparators(next);
              setError("");
            }}
          />
        ) : null}

        <FormField label={t("content_moderation.words.field_note")} optional>
          <TextInput
            value={note}
            maxLength={limits.max_note_chars}
            onChange={(event) => setNote(event.currentTarget.value)}
            placeholder={t("content_moderation.words.field_note_placeholder")}
            autoComplete="off"
          />
        </FormField>

        <FormField label={t("content_moderation.words.field_enabled")}>
          <ToggleSwitch
            checked={enabled}
            ariaLabel={t("content_moderation.words.field_enabled")}
            onCheckedChange={setEnabled}
          />
        </FormField>

        {failure ? (
          <Callout tone="danger" role="alert">
            {failure}
          </Callout>
        ) : null}
      </Form>
    </Modal>
  );
}
