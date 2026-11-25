import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, ExternalLink, RefreshCw, XCircle } from "@code-proxy/ui/icons";
import type { BillingOrder } from "@code-proxy/api-client";
import { Button, Modal, surface } from "@code-proxy/ui";
import { formatYuan, orderStatusMeta } from "./billingFormat";
import { QrCodeSvg } from "./QrCodeSvg";

export function CheckoutQrModal({
  order,
  pollOrder,
  onPaid,
  onClose,
}: {
  order: BillingOrder | null;
  pollOrder: (orderNo: string, sync: boolean) => Promise<BillingOrder>;
  onPaid?: (order: BillingOrder) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [liveOrder, setLiveOrder] = useState<BillingOrder | null>(order);
  const [checking, setChecking] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const paidNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    setLiveOrder(order);
    setImgFailed(false);
    setNowMs(Date.now());
    paidNotifiedRef.current = null;
  }, [order]);

  const checkStatus = useCallback(
    async (sync: boolean) => {
      if (!liveOrder) return;
      setChecking(true);
      try {
        const next = await pollOrder(liveOrder.order_no, sync);
        setLiveOrder(next);
        if (next.status === "fulfilled" && paidNotifiedRef.current !== next.order_no) {
          paidNotifiedRef.current = next.order_no;
          onPaid?.(next);
        }
      } catch {
        // Transient network hiccup; next poll will retry.
      } finally {
        setChecking(false);
      }
    },
    [liveOrder, onPaid, pollOrder],
  );

  useEffect(() => {
    if (!liveOrder || liveOrder.status !== "pending") return;
    const pollTimer = window.setInterval(() => {
      void checkStatus(true);
    }, 3500);
    const clockTimer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(pollTimer);
      window.clearInterval(clockTimer);
    };
  }, [checkStatus, liveOrder]);

  if (!liveOrder) return null;

  const isSuccess = liveOrder.status === "fulfilled";
  const isExpired = liveOrder.status === "expired" || liveOrder.status === "closed";
  const isFailed = liveOrder.status === "failed";
  const expireMs = Date.parse(liveOrder.expires_at);
  const remainingSec = Number.isNaN(expireMs) ? 0 : Math.max(0, Math.floor((expireMs - nowMs) / 1000));
  const mins = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const secs = String(remainingSec % 60).padStart(2, "0");
  const channelName =
    liveOrder.pay_channel === "alipay" ? t("billing.channel_alipay") : t("billing.channel_wechat");
  const statusInfo = orderStatusMeta(liveOrder.status, t);

  return (
    <Modal
      open={Boolean(order)}
      title={t("billing.checkout_modal_title")}
      size="sm"
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-4 py-1 text-center">
        <div className="space-y-1">
          <div className="text-sm font-medium text-ink">
            {liveOrder.target_label} · {liveOrder.plan_name}
          </div>
          <div className="font-mono text-3xl font-bold tracking-tight tabular-nums text-ink">
            {formatYuan(liveOrder.amount_cents)}
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <span>{channelName}</span>
            <span>·</span>
            <span className="font-mono">{liveOrder.order_no}</span>
          </div>
        </div>

        {isSuccess ? (
          <div
            className={`${surface({ tone: "inset", radius: "2xl" })} flex w-full flex-col items-center gap-2 px-5 py-6`}
          >
            <CheckCircle2 size={44} className="text-emerald-500" />
            <div className="text-base font-semibold text-ink">{t("billing.pay_success_title")}</div>
            {liveOrder.fulfillment_summary ? (
              <p className="text-xs text-ink-2">{liveOrder.fulfillment_summary}</p>
            ) : null}
          </div>
        ) : isExpired || isFailed ? (
          <div
            className={`${surface({ tone: "inset", radius: "2xl" })} flex w-full flex-col items-center gap-2 px-5 py-6`}
          >
            <XCircle size={40} className="text-rose-500" />
            <div className="text-sm font-semibold text-ink">{statusInfo.label}</div>
            {liveOrder.fulfillment_error ? (
              <p className="text-xs text-ink-3">{liveOrder.fulfillment_error}</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-ink/10">
              {liveOrder.qrcode_url && !imgFailed ? (
                <img
                  src={liveOrder.qrcode_url}
                  alt={t("billing.scan_qr_alt")}
                  className="h-52 w-52 object-contain"
                  onError={() => setImgFailed(true)}
                />
              ) : liveOrder.pay_url ? (
                <QrCodeSvg value={liveOrder.pay_url} size={208} label={t("billing.scan_qr_alt")} />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center text-xs text-ink-3">
                  {t("billing.qr_unavailable")}
                </div>
              )}
            </div>

            <div className="space-y-1 text-xs text-ink-2">
              <div className="flex items-center justify-center gap-1.5">
                <Clock size={13} className="text-ink-3" />
                <span>
                  {t("billing.scan_hint", {
                    channel: channelName,
                    remaining: remainingSec > 0 ? `${mins}:${secs}` : "00:00",
                  })}
                </span>
              </div>
              <p className="text-ink-3">{t("billing.auto_detect_hint")}</p>
            </div>
          </>
        )}

        <div className="flex w-full flex-wrap items-center justify-center gap-2 pt-1">
          {!isSuccess && !isExpired && liveOrder.pay_url ? (
            <a
              href={liveOrder.pay_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-ink/[0.06] px-3.5 text-xs font-medium text-ink transition hover:bg-ink/[0.1] dark:bg-white/[0.08] dark:hover:bg-white/[0.14]"
            >
              <ExternalLink size={14} />
              {t("billing.open_mobile_pay", { channel: channelName })}
            </a>
          ) : null}
          {!isSuccess ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void checkStatus(true)}
              disabled={checking}
            >
              <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
              {t("billing.ive_paid_check")}
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={onClose}>
              {t("common.done")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
