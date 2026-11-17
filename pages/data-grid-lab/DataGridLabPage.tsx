import { useState } from "react";
import { ApiKeySelectionDemo } from "./ApiKeySelectionDemo";
import { Segmented } from "./LabHeader";
import { RequestLogsDemo } from "./RequestLogsDemo";

/**
 * 新表格组件的演示页（计划 104），只在开发环境注册（见 route.tsx）。
 * 两个演示：请求日志（筛选区、表头菜单、固定列、拖宽、展开、吞吐、分页、各种状态），
 * API Key 列表（多选与批量操作）。请求日志不开多选：日志是只读流水，没有要批量处理的动作。
 */
type LabDemo = "request-logs" | "api-keys";

export function DataGridLabPage() {
  const [demo, setDemo] = useState<LabDemo>("request-logs");
  return (
    <section data-page-fill="always" className="flex flex-1 flex-col gap-3">
      <h1 className="sr-only">新表格组件演示</h1>
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <span>演示</span>
        <Segmented<LabDemo>
          id="lab-demo-switch"
          label="选择演示"
          value={demo}
          onChange={setDemo}
          options={[
            { value: "request-logs", label: "请求日志" },
            { value: "api-keys", label: "API Key（多选）" },
          ]}
        />
      </div>
      {demo === "request-logs" ? <RequestLogsDemo /> : <ApiKeySelectionDemo />}
    </section>
  );
}
