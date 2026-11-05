import { useCallback, useEffect, useRef, useState } from "react";
import type { MaskQuery, MaskRecord, MaskRecordDetail, MaskSummary } from "@code-proxy/api-client";
import type { FeedFacet } from "./MaskingFeed";
import type { MaskingSource } from "./source";

/** 页面在前台时每 15 秒取一次新记录，新的插到最上面，已显示的不动。 */
const LIVE_MS = 15_000;
const PAGE = 40;

export interface MaskingFilters {
  client: string;
  channel: string;
  kind: string;
}

/**
 * 观测页的数据：头卡的汇总（只按时间段，筛选不改它，分面上的数字始终是全部的）、列表（按时间段、
 * 分面和筛选），以及打开的一条的详情。
 *
 * active 为 false 时不刷新：门户里这一页打开过就一直挂着（切走再回来，设置的草稿还在），藏在别的
 * 标签后面时不该每 15 秒替每个门户用户查一次库。
 */
export function useMaskingOverview(source: MaskingSource, active = true) {
  const [days, setDays] = useState<7 | 30>(7);
  const [facet, setFacet] = useState<FeedFacet>("");
  const [filters, setFilters] = useState<MaskingFilters>({ client: "", channel: "", kind: "" });
  const [summary, setSummary] = useState<MaskSummary | null>(null);
  const [records, setRecords] = useState<MaskRecord[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  const query = useCallback(
    (): MaskQuery => ({
      days,
      facet: facet || undefined,
      kind: filters.kind || undefined,
      client: filters.client || undefined,
      channel: filters.channel || undefined,
    }),
    [days, facet, filters],
  );

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    source
      .getSummary({ days })
      .then((value) => !cancelled && setSummary(value))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [source, days]);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    source
      .listRecords(query(), { limit: PAGE })
      .then((page) => {
        if (id !== seq.current) return;
        setRecords(page.items);
        setNext(page.next);
        setError("");
      })
      .catch((e: unknown) => id === seq.current && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => id === seq.current && setLoading(false));
  }, [source, query]);

  const loadMore = useCallback(() => {
    if (!next) return;
    const id = seq.current;
    setLoadingMore(true);
    source
      .listRecords(query(), { before: next, limit: PAGE })
      .then((page) => {
        if (id !== seq.current) return;
        setRecords((prev) => [...prev, ...page.items]);
        setNext(page.next);
      })
      .finally(() => setLoadingMore(false));
  }, [source, next, query]);

  // 实时：只在页面可见时取，新的记录插到最上面
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const id = seq.current;
      source
        .listRecords(query(), { limit: PAGE })
        .then((page) => {
          if (id !== seq.current) return;
          setRecords((prev) => {
            const newest = prev[0]?.key;
            if (!newest) return page.items;
            const at = page.items.findIndex((r) => r.key === newest);
            // 两次之间来了一整页以上：从最新的一页重新开始，免得中间缺一段
            if (at === -1) return page.items;
            return at === 0 ? prev : [...page.items.slice(0, at), ...prev];
          });
        })
        .catch(() => undefined);
      source
        .getSummary({ days })
        .then(setSummary)
        .catch(() => undefined);
    }, LIVE_MS);
    return () => window.clearInterval(timer);
  }, [source, active, days, query]);

  return {
    days,
    setDays,
    facet,
    setFacet,
    filters,
    setFilters,
    summary,
    records,
    loading,
    loadingMore,
    hasMore: !!next,
    loadMore,
    error,
  };
}

/** 打开的一条记录的详情。 */
export function useMaskingRecord(source: MaskingSource, key: string | null) {
  const [detail, setDetail] = useState<MaskRecordDetail | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!key) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    source
      .getRecord(key)
      .then((value) => !cancelled && setDetail(value))
      .catch(() => !cancelled && setDetail(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [source, key]);
  return { detail, loading };
}
