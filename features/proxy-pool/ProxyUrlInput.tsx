import { ClipboardPaste, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Callout, SegmentedControl, TextInput } from "@code-proxy/ui";
import {
  composeProxyUrl,
  DEFAULT_PROXY_PORT,
  EMPTY_PROXY_PARTS,
  maskedProxyUrl,
  parseProxyUrl,
  PROXY_SCHEMES,
  validateProxyParts,
  type ProxyScheme,
  type ProxyUrlParts,
} from "./proxyUrlParts";

type PartField = "host" | "port" | "username" | "password";

const SCHEME_LABEL: Record<ProxyScheme, string> = { http: "HTTP", https: "HTTPS", socks5: "SOCKS5" };

/** 看起来像一整串地址（带协议、带账号，或「主机:端口」）时，粘贴到主机框里就整体拆开。 */
const looksLikeFullAddress = (text: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.includes("@") || /^[^\s:/]+:\d{1,5}$/.test(text);

/**
 * 结构化的代理地址输入：协议、主机、端口必填，账号密码可选；也可以把整串地址粘进来自动拆开。
 *
 * 为什么不再是一个文本框：手敲 `socks5://user:p@ss@host:1080` 时，密码里的 `@` `:` 会把地址拆错，
 * 漏写端口、写错协议也只能等到请求失败才发现。这里逐项校验、自动编码账号密码，
 * 拼出来的仍然是同一个 URL 字符串，后端与存储格式不变。
 *
 * 受控组件：`value` 是 URL 字符串。编辑中的中间状态（例如只填了账号还没填主机）保存在内部，
 * 不会因为拼不出 URL 而被父组件回传的空值冲掉。
 */
export function ProxyUrlInput({
  value,
  onChange,
  label,
  description,
  required = false,
  disabled = false,
  showErrors = false,
  collapsible = false,
  onValidityChange,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: ReactNode;
  description?: ReactNode;
  /** 必须填写（代理池条目）；可选时全部留空表示不使用代理。 */
  required?: boolean;
  disabled?: boolean;
  /** 提交过一次后由父组件打开：没碰过的字段也显示错误。 */
  showErrors?: boolean;
  /**
   * 可选字段用：没有值时只显示一行「+ 填写代理地址」，展开后多一个「移除」把值清空并收起。
   * 回退代理这类大多数人不填的项，不必一上来就摊开五个输入框。
   */
  collapsible?: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const lastEmitted = useRef<string | null>(null);
  const [parts, setParts] = useState<ProxyUrlParts>(() => parseProxyUrl(value)?.parts ?? EMPTY_PROXY_PARTS);
  const [unrecognized, setUnrecognized] = useState<string>(() => {
    const parsed = parseProxyUrl(value);
    return value.trim() && (!parsed || !parsed.scheme) ? value.trim() : "";
  });
  const [touched, setTouched] = useState<ReadonlySet<PartField>>(() => new Set());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState(false);
  const [expanded, setExpanded] = useState(() => !collapsible || Boolean(value.trim()));

  // 外部换了值（加载完成、切换到另一条记录）才重新拆分；自己刚发出去的值不回灌。
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    const parsed = parseProxyUrl(value);
    setParts(parsed?.parts ?? EMPTY_PROXY_PARTS);
    setUnrecognized(value.trim() && (!parsed || !parsed.scheme) ? value.trim() : "");
    setTouched(new Set());
    if (value.trim()) setExpanded(true);
  }, [value]);

  const issues = useMemo(() => validateProxyParts(parts, required), [parts, required]);
  // 认不出来的旧值只提示、不拦：可选字段里它会原样保留，直到用户改动；
  // 必填（代理池）时主机为空本身就会报错。
  const valid = Object.keys(issues).length === 0;
  useEffect(() => {
    onValidityChange?.(valid);
  }, [onValidityChange, valid]);

  const emit = (next: ProxyUrlParts) => {
    setParts(next);
    setUnrecognized("");
    const url = composeProxyUrl(next);
    lastEmitted.current = url;
    onChange(url);
  };

  const update = (patch: Partial<ProxyUrlParts>) => emit({ ...parts, ...patch });

  const applyAddress = (text: string): boolean => {
    const parsed = parseProxyUrl(text, parts.scheme);
    if (!parsed || !parsed.scheme) return false;
    emit(parsed.parts);
    setTouched(new Set(["host", "port", "username"]));
    return true;
  };

  const onHostPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text").trim();
    if (!text || !looksLikeFullAddress(text)) return;
    if (applyAddress(text)) event.preventDefault();
  };

  const submitPaste = () => {
    if (!pasteText.trim()) {
      setPasteOpen(false);
      return;
    }
    if (applyAddress(pasteText)) {
      setPasteText("");
      setPasteError(false);
      setPasteOpen(false);
    } else {
      setPasteError(true);
    }
  };

  const errorOf = (field: "host" | "port" | "username") => {
    const issue = issues[field];
    if (!issue || !(showErrors || touched.has(field))) return null;
    return t(`validation.${issue.key}`, { ...issue.params, defaultValue: t("validation.format") });
  };
  // 与 useFormValidation 同一个规则：填过内容的项失焦后才报错，空着路过不打扰，提交时再统一提示。
  const everFilled = useRef<Set<PartField>>(new Set());
  for (const field of ["host", "port", "username", "password"] as const) {
    if (parts[field]) everFilled.current.add(field);
  }
  const touch = (field: PartField) => {
    if (!everFilled.current.has(field)) return;
    setTouched((previous) => (previous.has(field) ? previous : new Set(previous).add(field)));
  };

  const fieldId = (field: PartField) => `${baseId}-${field}`;
  const preview = maskedProxyUrl(parts);
  const subLabel = "mb-1.5 block text-xs font-medium text-ink-2";
  const errorText = "mt-1 text-xs text-rose-600 dark:text-rose-400";

  const header = (
    <>
      {label ? (
        <legend className="mb-1 text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ml-0.5 text-rose-500" aria-hidden="true">
              *
            </span>
          ) : (
            <span className="ml-1.5 text-xs font-normal text-ink-3">{t("common.optional")}</span>
          )}
        </legend>
      ) : null}
      {description ? <p className="-mt-1 text-xs leading-5 text-ink-3">{description}</p> : null}
    </>
  );

  if (collapsible && !expanded) {
    return (
      <fieldset className="min-w-0 space-y-2 border-0 p-0" disabled={disabled}>
        {header}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          // 阴影描边的小按钮，和输入框同一套描边；虚线框只留给文件拖放区。
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ink-2 shadow-control transition-[color,box-shadow] hover:text-ink hover:shadow-control-hover focus-visible:shadow-control-focus focus-visible:outline-none"
        >
          <Plus size={13} aria-hidden="true" />
          {t("proxy_input.add")}
        </button>
      </fieldset>
    );
  }

  return (
    <fieldset className="min-w-0 space-y-3 border-0 p-0" disabled={disabled}>
      {header}

      {unrecognized ? (
        <Callout tone="warning" title={t("proxy_input.unrecognized_title")}>
          <span className="break-all font-mono text-xs">{unrecognized}</span>
          <span className="mt-1 block">{t("proxy_input.unrecognized_desc")}</span>
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          ariaLabel={t("proxy_input.scheme")}
          value={parts.scheme}
          onChange={(scheme) => update({ scheme })}
          disabled={disabled}
          size="sm"
          options={PROXY_SCHEMES.map((scheme) => ({ value: scheme, label: SCHEME_LABEL[scheme] }))}
        />
        <button
          type="button"
          onClick={() => {
            setPasteOpen((open) => !open);
            setPasteError(false);
          }}
          aria-expanded={pasteOpen}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          {pasteOpen ? <X size={13} aria-hidden="true" /> : <ClipboardPaste size={13} aria-hidden="true" />}
          {pasteOpen ? t("proxy_input.paste_cancel") : t("proxy_input.paste_open")}
        </button>
        {collapsible ? (
          <button
            type="button"
            onClick={() => {
              emit(EMPTY_PROXY_PARTS);
              setPasteOpen(false);
              setExpanded(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-ink-3 transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300"
          >
            <Trash2 size={13} aria-hidden="true" />
            {t("proxy_input.remove")}
          </button>
        ) : null}
      </div>

      {pasteOpen ? (
        <div>
          <TextInput
            autoFocus
            value={pasteText}
            invalid={pasteError}
            placeholder="socks5://user:password@203.0.113.7:1080"
            aria-label={t("proxy_input.paste_label")}
            className="font-mono"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setPasteText(event.currentTarget.value);
              setPasteError(false);
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (text && applyAddress(text)) {
                event.preventDefault();
                setPasteText("");
                setPasteOpen(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitPaste();
              }
            }}
          />
          <p className={pasteError ? errorText : "mt-1 text-xs text-ink-3"} role={pasteError ? "alert" : undefined}>
            {pasteError ? t("proxy_input.paste_invalid") : t("proxy_input.paste_hint")}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
        <div className="min-w-0">
          <label htmlFor={fieldId("host")} className={subLabel}>
            {t("proxy_input.host")}
          </label>
          <TextInput
            id={fieldId("host")}
            value={parts.host}
            placeholder="203.0.113.7"
            invalid={Boolean(errorOf("host"))}
            aria-describedby={errorOf("host") ? `${fieldId("host")}-error` : undefined}
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
            onPaste={onHostPaste}
            onBlur={() => touch("host")}
            onChange={(event) => update({ host: event.currentTarget.value.trim() })}
          />
          {errorOf("host") ? (
            <p id={`${fieldId("host")}-error`} role="alert" className={errorText}>
              {errorOf("host")}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={fieldId("port")} className={subLabel}>
            {t("proxy_input.port")}
          </label>
          <TextInput
            id={fieldId("port")}
            value={parts.port}
            placeholder={DEFAULT_PROXY_PORT[parts.scheme]}
            inputMode="numeric"
            invalid={Boolean(errorOf("port"))}
            aria-describedby={errorOf("port") ? `${fieldId("port")}-error` : undefined}
            className="font-mono tabular-nums"
            onBlur={() => touch("port")}
            onChange={(event) => update({ port: event.currentTarget.value.replace(/\D+/g, "").slice(0, 5) })}
          />
          {errorOf("port") ? (
            <p id={`${fieldId("port")}-error`} role="alert" className={errorText}>
              {errorOf("port")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={fieldId("username")} className={subLabel}>
            {t("proxy_input.username")}
            <span className="ml-1.5 font-normal text-ink-3">{t("common.optional")}</span>
          </label>
          <TextInput
            id={fieldId("username")}
            value={parts.username}
            invalid={Boolean(errorOf("username"))}
            aria-describedby={errorOf("username") ? `${fieldId("username")}-error` : undefined}
            spellCheck={false}
            autoComplete="off"
            onBlur={() => touch("username")}
            onChange={(event) => update({ username: event.currentTarget.value })}
          />
          {errorOf("username") ? (
            <p id={`${fieldId("username")}-error`} role="alert" className={errorText}>
              {errorOf("username")}
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <label htmlFor={fieldId("password")} className={subLabel}>
            {t("proxy_input.password")}
            <span className="ml-1.5 font-normal text-ink-3">{t("common.optional")}</span>
          </label>
          <TextInput
            id={fieldId("password")}
            type="password"
            value={parts.password}
            autoComplete="new-password"
            onBlur={() => touch("password")}
            onChange={(event) => update({ password: event.currentTarget.value })}
          />
        </div>
      </div>

      {preview ? (
        <p className="flex min-w-0 items-center gap-2 text-xs text-ink-3">
          <span className="shrink-0">{t("proxy_input.preview")}</span>
          <code className="min-w-0 truncate rounded-md bg-subtle px-1.5 py-0.5 font-mono text-ink-2">
            {preview}
          </code>
        </p>
      ) : !required ? (
        <p className="text-xs text-ink-3">{t("proxy_input.empty_means_direct")}</p>
      ) : null}
    </fieldset>
  );
}
