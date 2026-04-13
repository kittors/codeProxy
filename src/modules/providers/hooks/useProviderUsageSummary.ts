import { useCallback } from "react";
import type { OpenAIProvider, ProviderSimpleConfig } from "@/lib/http/types";
import {
  buildCandidateUsageSourceIds,
  type KeyStatBucket,
} from "@/modules/providers/provider-usage";
import { sumStatsByCandidates } from "@/modules/providers/providers-helpers";

type StatusBarData = import("@/utils/usage").StatusBarData;
type StatusBlockState = import("@/utils/usage").StatusBlockState;
type StatusBlockDetail = import("@/utils/usage").StatusBlockDetail;

function buildStatusBarData(stats: KeyStatBucket): StatusBarData {
  if (stats.success === 0 && stats.failure === 0) {
    return {
      blocks: [],
      blockDetails: [],
      successRate: 100,
      totalSuccess: 0,
      totalFailure: 0,
    };
  }

  const blockCount = 20;
  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];
  const total = stats.success + stats.failure;
  let tempFail = stats.failure;
  let tempSuccess = stats.success;

  for (let i = 0; i < blockCount; i++) {
    const failPart = Math.floor(tempFail / (blockCount - i));
    const successPart = Math.floor(tempSuccess / (blockCount - i));
    tempFail -= failPart;
    tempSuccess -= successPart;

    if (failPart === 0 && successPart === 0) {
      blocks.push("idle");
    } else if (failPart === 0) {
      blocks.push("success");
    } else if (successPart === 0) {
      blocks.push("failure");
    } else {
      blocks.push("mixed");
    }

    blockDetails.push({
      success: successPart,
      failure: failPart,
      rate: successPart + failPart > 0 ? successPart / (successPart + failPart) : -1,
      startTime: 0,
      endTime: 0,
    });
  }

  return {
    blocks,
    blockDetails,
    successRate: (stats.success / total) * 100,
    totalSuccess: stats.success,
    totalFailure: stats.failure,
  };
}

export function useProviderUsageSummary({
  usageStatsBySource,
  maskApiKey,
}: {
  usageStatsBySource: Record<string, KeyStatBucket>;
  maskApiKey: (value: string) => string;
}) {
  const getSimpleStats = useCallback(
    (config: ProviderSimpleConfig): KeyStatBucket => {
      const candidates = buildCandidateUsageSourceIds({
        apiKey: config.apiKey,
        prefix: config.prefix,
        masker: maskApiKey,
      });
      return sumStatsByCandidates(candidates, usageStatsBySource);
    },
    [maskApiKey, usageStatsBySource],
  );

  const getSimpleStatusBar = useCallback(
    (config: ProviderSimpleConfig): StatusBarData => buildStatusBarData(getSimpleStats(config)),
    [getSimpleStats],
  );

  const getOpenAIProviderStats = useCallback(
    (provider: OpenAIProvider): KeyStatBucket => {
      const candidates = new Set<string>();
      (provider.apiKeyEntries || []).forEach((entry) => {
        buildCandidateUsageSourceIds({
          apiKey: entry.apiKey,
          prefix: provider.prefix,
          masker: maskApiKey,
        }).forEach((candidate) => candidates.add(candidate));
      });
      return sumStatsByCandidates(Array.from(candidates), usageStatsBySource);
    },
    [maskApiKey, usageStatsBySource],
  );

  const getOpenAIKeyEntryStats = useCallback(
    (entry: NonNullable<OpenAIProvider["apiKeyEntries"]>[number]): KeyStatBucket => {
      const candidates = buildCandidateUsageSourceIds({
        apiKey: entry.apiKey,
        masker: maskApiKey,
      });
      return sumStatsByCandidates(candidates, usageStatsBySource);
    },
    [maskApiKey, usageStatsBySource],
  );

  const getOpenAIProviderStatusBar = useCallback(
    (provider: OpenAIProvider): StatusBarData => buildStatusBarData(getOpenAIProviderStats(provider)),
    [getOpenAIProviderStats],
  );

  return {
    getSimpleStats,
    getSimpleStatusBar,
    getOpenAIProviderStats,
    getOpenAIKeyEntryStats,
    getOpenAIProviderStatusBar,
  };
}
