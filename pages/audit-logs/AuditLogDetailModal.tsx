import { useTranslation } from "react-i18next";
import { Code2, ScrollText, Workflow } from "lucide-react";
import type { AuditLogIdentity } from "@code-proxy/api-client";
import { DetailList, FormSection, Modal, SkeletonLines, surface } from "@code-proxy/ui";
import { asCallChain, formatActor, formatWhatHappened, resultBadge } from "./auditLogFormat";

/**
 * 审计日志详情。
 *
 * 基本字段用统一的 DetailList（请求 ID 可复制、标识类用等宽字体）；调用链路和项目方法在完整记录
 * 加载回来之前显示骨架屏，而不是一行灰字「加载中…」。表格里刻意隐藏的原始动作码（user.create）
 * 在这里给出，排查时需要它。
 */
export function AuditLogDetailModal({
  detail,
  loading,
  locale,
  onClose,
}: {
  detail: AuditLogIdentity | null;
  loading: boolean;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const callChain = asCallChain(detail?.changes?.call_chain);
  const projectMethod = detail?.changes?.project_method;
  const badge = detail ? resultBadge(detail.result) : null;

  return (
    <Modal
      open={detail !== null}
      title={t("identity_admin.audit_log_detail_title")}
      description={detail ? formatWhatHappened(detail) : undefined}
      icon={<ScrollText />}
      size="lg"
      onClose={onClose}
    >
      {detail ? (
        <div className="space-y-6">
          <DetailList
            items={[
              {
                label: t("identity_admin.time"),
                value: new Date(detail.created_at).toLocaleString(locale),
              },
              {
                label: t("identity_admin.result"),
                value: badge ? (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                  >
                    {t(badge.labelKey)}
                  </span>
                ) : null,
              },
              { label: t("identity_admin.actor"), value: formatActor(detail) },
              {
                label: t("identity_admin.source_ip"),
                value: detail.ip_address || "",
                mono: true,
              },
              { label: t("identity_admin.action"), value: detail.action, mono: true },
              {
                label: t("identity_admin.resource"),
                value: detail.resource_id
                  ? `${detail.resource_type} · ${detail.resource_id}`
                  : detail.resource_type,
                mono: true,
              },
              {
                label: t("identity_admin.request_id"),
                value: detail.request_id,
                copyValue: detail.request_id || undefined,
                mono: true,
                wide: true,
              },
            ]}
          />

          <FormSection title={t("identity_admin.call_chain")} icon={<Workflow />}>
            {loading ? (
              <SkeletonLines rows={3} />
            ) : callChain.length === 0 ? (
              <p className="text-sm text-ink-3">{t("identity_admin.no_call_chain")}</p>
            ) : (
              <ol className="space-y-2">
                {callChain.map((step, index) => (
                  <li
                    key={`${step.step ?? index}-${step.name ?? "step"}`}
                    className={`px-3 py-2 text-sm ${surface({ tone: "inset", radius: "xl" })}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-selected px-1.5 text-2xs font-semibold text-ink-2 tabular-nums">
                        {step.step ?? index + 1}
                      </span>
                      {step.layer ? (
                        <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-2xs font-medium text-ink-2 dark:bg-white/[0.07]">
                          {step.layer}
                        </span>
                      ) : null}
                      <span className="font-medium text-ink">{step.name || "—"}</span>
                    </div>
                    {step.detail || step.package || step.resource ? (
                      <p className="mt-1 text-xs text-ink-3">
                        {[
                          step.detail,
                          step.package,
                          step.resource
                            ? `${step.resource}${step.resource_id ? ` · ${step.resource_id}` : ""}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </FormSection>

          <FormSection title={t("identity_admin.project_method")} icon={<Code2 />}>
            {loading ? (
              <SkeletonLines rows={2} />
            ) : projectMethod ? (
              <div
                className={`px-3 py-2 font-mono text-xs text-ink-2 ${surface({ tone: "inset", radius: "xl" })}`}
              >
                <div>
                  {[projectMethod.package, projectMethod.handler || projectMethod.method]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
                {projectMethod.route || projectMethod.resource ? (
                  <div className="mt-1 text-ink-3">
                    {[projectMethod.route, projectMethod.resource].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-ink-3">{t("identity_admin.no_project_method")}</p>
            )}
          </FormSection>
        </div>
      ) : null}
    </Modal>
  );
}
