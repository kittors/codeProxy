import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Bot } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import { HUE_GLYPH, TextInput, cn, floatingPanelSurface } from "@code-proxy/ui";
import type { ModelOption } from "./ModelPatternInput";
import { useAnchoredPopover } from "./useAnchoredPopover";

const MAX_SUGGESTIONS = 60;

/**
 * 一个具体模型（路由目标、超额降级模型）：从目录里选，或直接写目录里还没有的名字。
 * 不接受通配——改写后的请求必须落到一个确定的模型上。
 */
export function ModelTargetInput({
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
  value: string;
  onChange: (next: string) => void;
  catalog: readonly ModelOption[];
  ariaLabel: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? `model-target-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { style } = useAnchoredPopover(anchorRef, open);

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const out: ModelOption[] = [];
    for (const option of catalog) {
      if (out.length >= MAX_SUGGESTIONS) break;
      if (option.value === value.trim()) continue;
      if (!query || option.value.toLowerCase().includes(query)) out.push(option);
    }
    return out;
  }, [catalog, value]);

  const showList = open && !disabled && suggestions.length > 0;

  const choose = (model: string) => {
    onChange(model);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        suggestions.length ? (current + step + suggestions.length) % suggestions.length : -1,
      );
      return;
    }
    if (event.key === "Enter" && showList && active >= 0 && suggestions[active]) {
      event.preventDefault();
      choose(suggestions[active].value);
      return;
    }
    if (event.key === "Escape" && showList) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const trimmed = value.trim();

  return (
    <>
      <div ref={anchorRef}>
        <TextInput
          id={inputId}
          size="sm"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listboxId}-${active}` : undefined}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          // 始终给一个起始图标：TextInput 有无图标是两种 DOM 结构，输入第一个字时切换结构会让
          // 输入框重新挂载、焦点丢失，后面的字就打不进来了。
          startAdornment={
            trimmed ? (
              <VendorIcon modelId={trimmed} size={14} />
            ) : (
              <Bot size={14} aria-hidden="true" className={cn("text-ink-3", HUE_GLYPH.violet)} />
            )
          }
          onChange={(event) => {
            onChange(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            if (value !== trimmed) onChange(trimmed);
          }}
          onKeyDown={onKeyDown}
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
              onMouseDown={(event) => event.preventDefault()}
            >
              {suggestions.map((option, index) => (
                <div
                  key={option.value}
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                    index === active ? "bg-hover text-ink" : "text-ink-2",
                  )}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option.value)}
                >
                  {option.icon ?? <VendorIcon modelId={option.value} size={13} />}
                  <span className="min-w-0 flex-1 truncate font-mono">{option.value}</span>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
