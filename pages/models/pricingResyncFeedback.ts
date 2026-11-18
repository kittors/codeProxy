import type { TFunction } from "i18next";
import { modelsApi, type PricingResyncJob } from "@code-proxy/api-client";
import { formatUsd } from "@code-proxy/domain";
import type { ModelFormState, ModelItem } from "./types";

/**
 * 改了模型价格之后，后端会把最近 7 天已记录请求的费用同步过去（CliRelay 的 pricing resync 任务）：
 * 默认只补当时没有价格、费用为 0 的请求，勾了「按新价重算」则全部重算。任务在改价约 90 秒后才跑，
 * 好让各节点先拿到新价格；这里保存后先说一声，再跟着任务，完成时报条数和金额。
 */

type Notify = (toast: { type: "success" | "error"; message: string }) => void;

const num = (value: string) => (value.trim() === "" ? 0 : Number(value));

/** 价格有没有变：与保存前列表里的那一行比；新加的模型填了价格也算。 */
export function pricingChanged(form: ModelFormState, before?: ModelItem): boolean {
  if (!before) {
    return form.mode === "call"
      ? num(form.pricePerCall) > 0
      : num(form.inputPrice) > 0 || num(form.outputPrice) > 0 || num(form.cachedPrice) > 0;
  }
  const pricing = before.pricing;
  if (form.mode !== pricing.mode) return true;
  if (form.mode === "call") return num(form.pricePerCall) !== (pricing.pricePerCall ?? 0);
  return (
    num(form.inputPrice) !== (pricing.inputPricePerMillion ?? 0) ||
    num(form.outputPrice) !== (pricing.outputPricePerMillion ?? 0) ||
    num(form.cachedPrice) !== (pricing.cachedPricePerMillion ?? 0)
  );
}

export interface FollowDeps {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  fetchJobs: () => Promise<PricingResyncJob[] | null>;
}

const defaultDeps: FollowDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  fetchJobs: () => modelsApi.getPricingResyncJobs(5),
};

const POLL_MS = 10_000;
const FOLLOW_MS = 5 * 60_000;
/** 服务器与浏览器的时钟会差几秒：保存前这么久内更新过的任务也认。 */
const CLOCK_SLACK_MS = 15_000;

/** 保存之后、由这次手动改价排进去或并进去的任务。 */
function jobForSave(jobs: PricingResyncJob[], savedAt: number): PricingResyncJob | undefined {
  return jobs.find((job) => job.origin === "manual" && Date.parse(job.updatedAt) >= savedAt - CLOCK_SLACK_MS);
}

/**
 * 跟着任务直到结束：完成且改了费用时报条数和金额（一条都没变就不打扰），失败时报错。旧后端没有任务
 * 接口时直接结束；跟了 5 分钟还没结束也结束，之后的结果在请求日志里自然可见。
 */
export async function followPricingResync(savedAt: number, notify: Notify, t: TFunction, deps: FollowDeps = defaultDeps) {
  while (deps.now() < savedAt + FOLLOW_MS) {
    await deps.sleep(POLL_MS);
    let jobs: PricingResyncJob[] | null;
    try {
      jobs = await deps.fetchJobs();
    } catch {
      continue;
    }
    if (jobs === null) return;
    const job = jobForSave(jobs, savedAt);
    if (!job) continue;
    if (job.status === "failed") {
      notify({ type: "error", message: t("models_page.pricing_resync_failed", { error: job.lastError || "-" }) });
      return;
    }
    if (job.status === "done") {
      if (job.changed > 0) {
        notify({
          type: "success",
          message: t("models_page.pricing_resync_done", { count: job.changed, amount: formatUsd(job.costDelta, { fractionDigits: 4 }) }),
        });
      }
      return;
    }
  }
}

/** 保存模型后的提示：价格没变照旧说「已保存」；变了就说历史费用稍后同步，并跟着任务。 */
export function announceSavedModel({
  form,
  before,
  notify,
  t,
}: {
  form: ModelFormState;
  before?: ModelItem;
  notify: Notify;
  t: TFunction;
}) {
  if (!form.resyncHistory && !pricingChanged(form, before)) {
    notify({ type: "success", message: t("models_page.config_saved") });
    return;
  }
  notify({ type: "success", message: t("models_page.pricing_resync_started") });
  void followPricingResync(Date.now(), notify, t);
}
