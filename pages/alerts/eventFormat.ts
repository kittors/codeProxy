/**
 * 告警记录里的时间：列表里只要「11/01 14:03」这种能对上时间线的写法，悬停时再给带秒的完整时间。
 * 时区跟随浏览器（和面板其它页面一致）；解析不了的原样返回，不拿 Invalid Date 糊弄用户。
 */
export function formatEventTime(iso: string, locale: string): { short: string; full: string } {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { short: iso, full: iso };
  const date = new Date(ms);
  return {
    short: new Intl.DateTimeFormat(locale, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date),
    full: new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "medium",
      hourCycle: "h23",
    }).format(date),
  };
}
