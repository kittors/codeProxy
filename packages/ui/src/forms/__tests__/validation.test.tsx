import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@code-proxy/i18n";
import { beforeEach, describe, expect, test } from "vitest";
import { FormField } from "../../primitives/Form";
import { TextInput } from "../../primitives/Input";
import { rules, runRules, useFormValidation } from "../validation";

const keyOf = (rule: ReturnType<typeof rules.required>, value: unknown) => rule(value)?.key ?? null;

describe("rules", () => {
  test("required treats whitespace and empty lists as blank", () => {
    const rule = rules.required();
    expect(keyOf(rule, "")).toBe("required");
    expect(keyOf(rule, "   ")).toBe("required");
    expect(keyOf(rule, [])).toBe("required");
    expect(keyOf(rule, "x")).toBeNull();
  });

  test("format rules skip empty values so optional fields can stay blank", () => {
    for (const rule of [rules.integer(), rules.url(), rules.host(), rules.port(), rules.cidr(), rules.json()]) {
      expect(rule("")).toBeNull();
    }
  });

  test("integer explains which bound was missed", () => {
    expect(rules.integer()("12a")).toEqual({ key: "non_negative" });
    expect(rules.integer({ allowNegative: true })("-1.5")).toEqual({ key: "integer" });
    expect(rules.integer({ min: 1, max: 10 })("11")).toEqual({ key: "range", params: { min: 1, max: 10 } });
    expect(rules.integer({ min: 5 })("4")).toEqual({ key: "min", params: { min: 5 } });
    expect(rules.integer({ max: 5 })("6")).toEqual({ key: "max", params: { max: 5 } });
    expect(rules.integer()("99999999999999999999")).toEqual({ key: "integer" });
    expect(rules.integer({ min: 0 })(" 7 ")).toBeNull();
  });

  test("maxBytes counts UTF-8 bytes like the Go backend, after trimming", () => {
    const rule = rules.maxBytes(6);
    expect(rule("abcdef")).toBeNull();
    expect(rule("  abcdef  ")).toBeNull();
    expect(rule("中文")).toBeNull();
    // 三个汉字 = 9 字节：按字符数会放行，后端会拒。
    expect(rule("中文名")).toEqual({ key: "max_bytes", params: { max: 6 } });
    expect(rules.maxLength(6)("中文名")).toBeNull();
  });

  test("url checks the scheme and the host", () => {
    expect(rules.url()("https://example.com/v1")).toBeNull();
    expect(rules.url()("ftp://example.com")).toEqual({
      key: "url_protocol",
      params: { protocols: "http / https" },
    });
    expect(rules.url({ protocols: ["socks5"] })("socks5://127.0.0.1:1080")).toBeNull();
    expect(rules.url()("not a url")).toEqual({ key: "url" });
  });

  test("host, port and cidr accept real addresses only", () => {
    expect(rules.host()("api.example.com")).toBeNull();
    expect(rules.host()("10.0.0.1")).toBeNull();
    expect(rules.host()("[::1]")).toBeNull();
    expect(rules.host()("256.1.1.1")).toEqual({ key: "host" });
    expect(rules.host()("bad_host!")).toEqual({ key: "host" });

    expect(rules.port()("443")).toBeNull();
    expect(rules.port()("0")).toEqual({ key: "port" });
    expect(rules.port()("65536")).toEqual({ key: "port" });

    expect(rules.cidr()("203.0.113.0/24")).toBeNull();
    expect(rules.cidr()("203.0.113.7")).toBeNull();
    expect(rules.cidr()("2001:db8::/32")).toBeNull();
    expect(rules.cidr()("203.0.113.0/33")).toEqual({ key: "cidr" });
    expect(rules.cidr()("203.0.113/24")).toEqual({ key: "cidr" });
    expect(rules.cidr()("1.2.3.4/8/9")).toEqual({ key: "cidr" });
  });

  test("json and custom rules", () => {
    expect(rules.json()('{"a":1}')).toBeNull();
    expect(rules.json()("{a:1}")).toEqual({ key: "json" });
    const even = rules.custom<number>((value) => value % 2 === 0 || "not_even");
    expect(even(2)).toBeNull();
    expect(even(3)).toEqual({ key: "not_even" });
    expect(rules.custom<number>(() => false)(1)).toEqual({ key: "format" });
  });

  test("runRules stops at the first failing rule", () => {
    expect(runRules("", [rules.required(), rules.maxLength(1)])).toEqual({ key: "required" });
    expect(runRules("ab", [rules.required(), rules.maxLength(1)])).toEqual({
      key: "max_length",
      params: { max: 1 },
    });
    expect(runRules("a", undefined)).toBeNull();
  });
});

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [form, setForm] = useState({ name: "", port: "" });
  const validation = useFormValidation(form, {
    name: [rules.required(), rules.maxLength(5)],
    port: [rules.required(), rules.port()],
  });
  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!validation.validate()) {
          validation.focusFirstInvalid(formRef.current);
          return;
        }
        onSubmit();
      }}
    >
      <FormField label="Name" error={validation.error("name")}>
        <TextInput
          value={form.name}
          {...validation.bind("name")}
          onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
        />
      </FormField>
      <FormField label="Port" error={validation.error("port")}>
        <TextInput
          value={form.port}
          {...validation.bind("port")}
          onChange={(event) => setForm((previous) => ({ ...previous, port: event.target.value }))}
        />
      </FormField>
      <button type="submit">Save</button>
      <button type="button" onClick={validation.reset}>
        Reset
      </button>
    </form>
  );
}

describe("useFormValidation", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("leaving an empty field alone does not nag; a filled field reports on blur", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={() => undefined} />);
    const name = screen.getByRole("textbox", { name: "Name" });
    const port = screen.getByRole("textbox", { name: "Port" });

    // 自动聚焦后点去别处：还没填过，不报「必填」。
    await user.click(name);
    await user.click(port);
    expect(name).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Required")).toBeNull();

    // 填过再离开：就地报出格式错误，并挂到 aria-describedby 上。
    await user.type(port, "70000");
    await user.tab();
    expect(port).toHaveAttribute("aria-invalid", "true");
    expect(port).toHaveAccessibleDescription("Port must be a number from 1 to 65535");
    // 修好后错误立即消失（不用再失焦一次）。
    await user.clear(port);
    await user.type(port, "8080");
    expect(port).not.toHaveAttribute("aria-invalid");
  });

  test("submit reveals every error and focuses the first one; reset hides them again", async () => {
    const user = userEvent.setup();
    let submitted = 0;
    render(<Harness onSubmit={() => (submitted += 1)} />);

    await user.type(screen.getByRole("textbox", { name: "Port" }), "8080");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toBe(0);
    const name = screen.getByRole("textbox", { name: "Name" });
    expect(name).toHaveAccessibleDescription("Required");
    await waitFor(() => expect(name).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(name).not.toHaveAttribute("aria-invalid");

    await user.type(name, "relay");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(submitted).toBe(1);
  });
});
