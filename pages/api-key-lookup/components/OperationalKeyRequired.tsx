/** 门户账号还没有可用 Key 时，模型列表和快速导入两个标签给的说明：它们需要一把凭证，用量与日志不需要。 */
export function OperationalKeyRequired({
  t,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div className="bg-subtle rounded-2xl px-6 py-12 text-center text-sm text-ink-3">
      {t("apikey_lookup.operational_key_required", {
        defaultValue: "请先创建一把可用 Key；模型列表和快速导入需要凭证，用量与日志仍按账号聚合。",
      })}
    </div>
  );
}
