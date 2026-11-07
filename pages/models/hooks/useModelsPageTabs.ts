import { useCallback, useEffect, useState } from "react";
import { useVirtualModelsSupport } from "../virtual-models/useVirtualModelsSupport";
import type { ModelPageTab, ModelScope } from "../types";

/**
 * 模型页的标签页。「虚拟模型」标签不加载模型数据：切过去时 modelScope 停在之前的标签上，
 * 统计卡片和切回来时的列表都不用重新请求。后端不再声明支持（换了租户、连着旧后端）时退回之前的标签。
 */
export function useModelsPageTabs() {
  const virtualModelsSupported = useVirtualModelsSupport();
  const [activeTab, setActiveTab] = useState<ModelPageTab>("active");
  const [modelScope, setModelScope] = useState<ModelScope>("active");

  useEffect(() => {
    if (!virtualModelsSupported) setActiveTab((tab) => (tab === "virtual" ? modelScope : tab));
  }, [modelScope, virtualModelsSupported]);

  const selectTab = useCallback((tab: ModelPageTab) => {
    setActiveTab(tab);
    if (tab !== "virtual") setModelScope(tab);
  }, []);

  return { activeTab, modelScope, selectTab, virtualModelsSupported };
}
