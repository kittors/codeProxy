import {
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Asterisk, Plus, X } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import { HUE_GLYPH, HUE_SOFT, cn, controlMultilineSurface, floatingPanelSurface } from "@code-proxy/ui";
import { isWildcardPattern, matchingCatalogModels, modelPatternMatches, normalizeModelPattern } from "../model/modelMatch";
import { useAnchoredPopover } from "./useAnchoredPopover";

export interface ModelOption {
  value: string;
  label?: string;
  icon?: ReactNode;
}

const MAX_SUGGESTIONS = 60;

const splitPasted = (text: string): string[] =>
  text
    .split(/[\s,;，；]+/)
    .map((item) => item.trim())
    .filter(Boolean);

/** 通配模式用星号图标与品红淡底，具体模型用厂商图标：一眼分得出「一类」和「一个」。 */
export function ModelPatternChip({
  pattern,
  matchCount,
  onRemove,
  removeLabel,
}: {
  pattern: string;
  matchCount?: number;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const wildcard = isWildcardPattern(pattern);
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full py-0.5 pl-1.5 text-xs font-medium",
        onRemove ? "pr-0.5" : "pr-2",
        "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
        wildcard ? HUE_SOFT.fuchsia : null,
      )}
      title={wildcard && typeof matchCount === "number" ? `${pattern} · ${matchCount}` : pattern}
    >
      {wildcard ? (
        <Asterisk size={12} aria-hidden="true" className={cn("shrink-0 text-ink-3", HUE_GLYPH.fuchsia)} />
      ) : (
        <VendorIcon modelId={pattern} size={12} />
      )}
      <span className="min-w-0 truncate font-mono">{pattern}</span>
      {wildcard && typeof matchCount === "number" ? (
        <span className="shrink-0 rounded-full bg-ink/[0.06] px-1 text-2xs tabular-nums dark:bg-white/[0.08]">
          {matchCount}
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.08] hover:text-ink dark:hover:bg-white/[0.1]"
        >
          <X size={10} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

interface Suggestion {
  value: string;
  kind: "add" | "model";
  icon?: ReactNode;
  hint?: string;
}

/**
 * 模型模式输入：回车、逗号或粘贴一串名字即成标签；支持 claude-opus-* 这样的通配，并实时
 * 预览它在当前模型目录里命中多少个模型。目录里没有的名字也能直接写（新模型上线前就能配规则）。
 */
export function ModelPatternInput({
  value,
  onChange,
  catalog,
  ariaLabel,
  placeholder,
  invalid,
  describedBy,
  disabled = false,
  id,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  catalog: readonly ModelOption[];
  ariaLabel: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useTranslation();
  const generatedId = useId();
  const inputId = id ?? `model-pattern-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const { style } = useAnchoredPopover(anchorRef, open);
  const catalogIds = useMemo(() => catalog.map((option) => option.value), [catalog]);
  const selectedKeys = useMemo(() => new Set(value.map(normalizeModelPattern)), [value]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const query = text.trim();
    const out: Suggestion[] = [];
    if (query && !selectedKeys.has(normalizeModelPattern(query))) {
      const wildcard = isWildcardPattern(query);
      out.push({
        value: query,
        kind: "add",
        hint: wildcard
          ? t("access_policy.pattern_matches", { count: matchingCatalogModels([query], catalogIds).length })
          : undefined,
      });
    }
    const lower = query.toLowerCase();
    for (const option of catalog) {
      if (out.length > MAX_SUGGESTIONS) break;
      if (selectedKeys.has(normalizeModelPattern(option.value))) continue;
      const hit = !query
        ? true
        : isWildcardPattern(query)
          ? modelPatternMatches(query, option.value)
          : option.value.toLowerCase().includes(lower);
      if (hit && option.value !== query) out.push({ value: option.value, kind: "model", icon: option.icon });
    }
    return out;
  }, [catalog, catalogIds, selectedKeys, t, text]);

  const add = (items: string[]) => {
    const next = [...value];
    const seen = new Set(next.map(normalizeModelPattern));
    for (const item of items) {
      const key = normalizeModelPattern(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      next.push(item.trim());
    }
    if (next.length !== value.length) onChange(next);
    setText("");
    setActive(0);
    setNavigated(false);
  };

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setNavigated(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (suggestions.length ? (current + step + suggestions.length) % suggestions.length : 0));
      return;
    }
    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
      // 只有打过字或用方向键挑过时才取高亮项：空输入框里按回车 / Tab 是提交表单 / 移走焦点。
      const picked = open && (navigated || text.trim()) ? suggestions[active] : undefined;
      if (picked) {
        event.preventDefault();
        add([picked.value]);
        return;
      }
      if (text.trim()) {
        event.preventDefault();
        add([text]);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      // 先收起建议列表；弹窗看到 defaultPrevented 就不会跟着关掉。
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Backspace" && !text && value.length > 0) {
      remove(value.length - 1);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const items = splitPasted(event.clipboardData.getData("text"));
    if (items.length > 1) {
      event.preventDefault();
      add(items);
    }
  };

  const showList = open && !disabled && suggestions.length > 0;

  return (
    <>
      <div
        ref={anchorRef}
        className={cn(
          controlMultilineSurface,
          "flex min-h-9 w-full flex-wrap items-center gap-1 px-2 py-1",
          disabled ? "cursor-not-allowed opacity-70" : "cursor-text",
        )}
        aria-invalid={invalid ? true : undefined}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((pattern, index) => (
          <ModelPatternChip
            key={`${pattern}-${index}`}
            pattern={pattern}
            matchCount={isWildcardPattern(pattern) ? matchingCatalogModels([pattern], catalogIds).length : undefined}
            onRemove={disabled ? undefined : () => remove(index)}
            removeLabel={t("access_policy.remove_model", { model: pattern })}
          />
        ))}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listboxId}-${active}` : undefined}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          value={text}
          placeholder={value.length === 0 ? placeholder : undefined}
          autoComplete="off"
          spellCheck={false}
          className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-ink-3"
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setNavigated(false);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            if (text.trim()) add([text]);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      </div>
      {showList
        ? createPortal(
            <div
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              style={style}
              className={cn(floatingPanelSurface, "overflow-y-auto p-1.5")}
              // 点选项时不让输入框失焦：失焦会把正在输入的文字当成一个标签提交。
              onMouseDown={(event) => event.preventDefault()}
            >
              {suggestions.map((item, index) => (
                <div
                  key={`${item.kind}-${item.value}`}
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                    index === active ? "bg-hover text-ink" : "text-ink-2",
                  )}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => add([item.value])}
                >
                  {item.kind === "add" ? (
                    isWildcardPattern(item.value) ? (
                      <Asterisk size={13} aria-hidden="true" className={cn("text-ink-3", HUE_GLYPH.fuchsia)} />
                    ) : (
                      <Plus size={13} aria-hidden="true" className={cn("text-ink-3", HUE_GLYPH.blue)} />
                    )
                  ) : (
                    (item.icon ?? <VendorIcon modelId={item.value} size={13} />)
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {item.kind === "add" ? t("access_policy.add_pattern", { pattern: item.value }) : item.value}
                  </span>
                  {item.hint ? <span className="shrink-0 text-2xs text-ink-3">{item.hint}</span> : null}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
