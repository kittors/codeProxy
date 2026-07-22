import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  contentModerationApi,
  type ContentModerationDecision,
  type ContentModerationProfileView,
} from "@code-proxy/api-client";
import { Button, Modal, Textarea } from "@code-proxy/ui";

export interface ModerationTestModalProps {
  profile: ContentModerationProfileView | null;
  onClose: () => void;
}

export function ModerationTestModal({ profile, onClose }: ModerationTestModalProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [decision, setDecision] = useState<ContentModerationDecision | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setInput("");
    setDecision(null);
    setError("");
  }, [profile]);

  const scoreRows = useMemo(
    () =>
      Object.entries(decision?.category_scores ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [decision],
  );

  const run = async () => {
    if (!profile || !input.trim() || running) return;
    setRunning(true);
    setDecision(null);
    setError("");
    try {
      setDecision(await contentModerationApi.testProfile(profile.id, input.trim()));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : t("content_moderation.test_failed"),
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={profile !== null}
      onClose={onClose}
      title={t("content_moderation.test_title")}
      description={
        profile ? t("content_moderation.test_description", { name: profile.name }) : undefined
      }
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={running}>
            {t("common.close")}
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={!input.trim() || running}>
            {running ? t("content_moderation.testing") : t("content_moderation.run_test")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("content_moderation.test_input")}
          </span>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder={t("content_moderation.test_input_placeholder")}
            aria-label={t("content_moderation.test_input")}
            className="min-h-36"
          />
          <span className="text-xs text-slate-500 dark:text-white/55">
            {t("content_moderation.no_prompt_storage")}
          </span>
        </label>

        {error ? (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {decision ? (
          <section
            className={[
              "rounded-xl border p-4",
              decision.would_block
                ? "border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-500/10"
                : decision.action === "api_error"
                  ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-500/10"
                  : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-500/10",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {decision.would_block
                    ? t("content_moderation.test_blocked")
                    : t("content_moderation.test_allowed")}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-600 dark:text-white/65">
                  {decision.action}
                </p>
              </div>
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700 dark:bg-black/20 dark:text-white/75">
                {t("content_moderation.latency_value", { value: decision.latency_ms })}
              </span>
            </div>

            {decision.matched_keyword ? (
              <p className="mt-3 text-sm text-slate-700 dark:text-white/75">
                {t("content_moderation.matched_keyword", {
                  keyword: decision.matched_keyword,
                })}
              </p>
            ) : null}
            {decision.highest_category ? (
              <p className="mt-3 text-sm text-slate-700 dark:text-white/75">
                {t("content_moderation.highest_category", {
                  category: decision.highest_category,
                  score: decision.highest_score?.toFixed(4) ?? "0",
                })}
              </p>
            ) : null}
            {decision.moderation_error ? (
              <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                {t("content_moderation.test_api_error", {
                  error: decision.moderation_error,
                })}
              </p>
            ) : null}

            {scoreRows.length ? (
              <div className="mt-4 max-h-52 overflow-y-auto rounded-lg bg-white/75 dark:bg-black/15">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white text-slate-500 dark:bg-neutral-950 dark:text-white/55">
                    <tr>
                      <th className="px-3 py-2 font-semibold">
                        {t("content_moderation.category")}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t("content_moderation.score")}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t("content_moderation.threshold")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreRows.map(([category, score]) => (
                      <tr
                        key={category}
                        className="border-t border-slate-200/70 dark:border-white/10"
                      >
                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-white/75">
                          {category}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-white/75">
                          {score.toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-white/55">
                          {decision.thresholds[category]?.toFixed(4) ?? "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
