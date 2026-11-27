import { useRef, useState, type ReactNode } from "react";
import { Icon } from "satin-ui/react";

/**
 * 基于 Satin `.sn-drop` 的凭证拖放上传区：
 * 拖入文件时虚线边框切换实线、图标容器微浮缩放（.sn-over），零 framer-motion。
 */
export function FileDropZone({
  title,
  hint,
  multiple = false,
  busy = false,
  onFiles,
  children,
}: {
  title: string;
  hint?: ReactNode;
  multiple?: boolean;
  busy?: boolean;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter(
      (file) => file.name.toLowerCase().endsWith(".json") || file.type === "application/json",
    );
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-disabled={busy || undefined}
      aria-label={title}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (busy || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        inputRef.current?.click();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy) take(event.dataTransfer.files);
      }}
      className={[
        "sn-drop",
        dragging ? "sn-over" : "",
        busy ? "cursor-progress opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          take(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <span className="sn-art">
        <Icon name="cloud-upload" size={20} />
      </span>
      <b>{title}</b>
      {hint ? <div className="sn-hint max-w-sm">{hint}</div> : null}
      {children}
    </div>
  );
}
