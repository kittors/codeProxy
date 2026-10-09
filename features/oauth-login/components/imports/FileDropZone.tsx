import { motion, useReducedMotion } from "framer-motion";
import { Upload } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

/**
 * Drop files here or click to choose. JSON credentials are usually sitting in a
 * downloads folder, so dragging them in beats a native file dialog.
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
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter(
      (file) => file.name.toLowerCase().endsWith(".json") || file.type === "application/json",
    );
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <motion.div
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
      animate={reduceMotion ? undefined : { scale: dragging ? 1.01 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={[
        "grid cursor-pointer justify-items-center gap-2 rounded-2xl border border-dashed px-5 py-8 text-center transition-colors",
        // 虚线框只留给文件拖放区；拖进来时简约风格换成强调色，多彩风格是天蓝。
        dragging
          ? "border-accent bg-accent-soft colorful:border-sky-500 colorful:bg-sky-500/8"
          : "border-line-strong bg-subtle hover:border-ink-4",
        busy ? "cursor-progress opacity-60" : "",
      ].join(" ")}
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
      <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-ink-2 shadow-xs">
        <Upload size={18} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint ? <div className="max-w-sm text-xs text-ink-3">{hint}</div> : null}
      {children}
    </motion.div>
  );
}
