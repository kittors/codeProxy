import { useCallback, useEffect, useState } from "react";
import type { HourWindow, TimeRange } from "@/modules/monitor/monitor-constants";

export type MonitorMetric = "requests" | "tokens";

export function useMonitorDashboardState() {
  const [compact, setCompact] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth < 700;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mq = window.matchMedia("(max-width: 699px)");
    const handleChange = (event: MediaQueryListEvent) => setCompact(event.matches);

    setCompact(mq.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [apiFilterInput, setApiFilterInput] = useState("");
  const [apiFilter, setApiFilter] = useState("");
  const [modelHourWindow, setModelHourWindow] = useState<HourWindow>(24);
  const [tokenHourWindow, setTokenHourWindow] = useState<HourWindow>(24);
  const [modelMetric, setModelMetric] = useState<MonitorMetric>("requests");
  const [apikeyMetric, setApikeyMetric] = useState<MonitorMetric>("requests");

  const applyFilter = useCallback(() => {
    setApiFilter(apiFilterInput);
  }, [apiFilterInput]);

  return {
    compact,
    timeRange,
    setTimeRange,
    apiFilterInput,
    setApiFilterInput,
    apiFilter,
    applyFilter,
    modelHourWindow,
    setModelHourWindow,
    tokenHourWindow,
    setTokenHourWindow,
    modelMetric,
    setModelMetric,
    apikeyMetric,
    setApikeyMetric,
  };
}
