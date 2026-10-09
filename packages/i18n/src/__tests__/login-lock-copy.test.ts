import i18next from "i18next";
import { beforeAll, describe, expect, test } from "vitest";
import en from "../locales/en.json";
import ru from "../locales/ru.json";
import zhCN from "../locales/zh-CN.json";

// The sign-in lock copy carries counts ("3 attempts left", "try again in 1
// minute"). Resolve it through a real i18next instance configured like the app,
// so a missing plural form shows up here instead of as "1 minutes" or as an
// English fallback inside the Russian UI.
const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.init({
    lng: "zh-CN",
    fallbackLng: ["en", "zh-CN"],
    interpolation: { escapeValue: false },
    resources: {
      "zh-CN": { translation: zhCN },
      en: { translation: en },
      ru: { translation: ru },
    },
  });
});

const tr = (lng: string, key: string, options: Record<string, unknown>) =>
  i18n.getFixedT(lng)(key, options) as string;

describe("sign-in lock copy", () => {
  test("remaining attempts agree with the number in every locale", () => {
    expect(tr("zh-CN", "login.error_invalid_credentials_remaining", { count: 3 })).toBe(
      "用户名或密码错误，还可尝试 3 次。",
    );
    expect(tr("en", "login.error_invalid_credentials_remaining", { count: 1 })).toBe(
      "Incorrect username or password. 1 attempt left.",
    );
    expect(tr("en", "login.error_invalid_credentials_remaining", { count: 4 })).toBe(
      "Incorrect username or password. 4 attempts left.",
    );
    const ruCases: Array<[number, string]> = [
      [1, "Осталась 1 попытка."],
      [2, "Осталось 2 попытки."],
      [5, "Осталось 5 попыток."],
      [11, "Осталось 11 попыток."],
      [21, "Осталась 21 попытка."],
    ];
    for (const [count, tail] of ruCases) {
      expect(tr("ru", "login.error_invalid_credentials_remaining", { count })).toBe(
        `Неверное имя пользователя или пароль. ${tail}`,
      );
    }
    expect(tr("ru", "login.remaining_attempts_notice", { count: 2 })).toBe(
      "Ещё 2 неверных пароля — и вход будет временно заблокирован.",
    );
    expect(tr("en", "login.remaining_attempts_notice", { count: 1 })).toBe(
      "1 more wrong password will temporarily lock sign-in.",
    );
    expect(tr("zh-CN", "login.remaining_attempts_notice", { count: 2 })).toBe(
      "再输错 2 次，登录将被临时锁定。",
    );
  });

  test("lock durations read naturally for one unit and for several", () => {
    expect(tr("en", "login.error_rate_limited_minutes", { count: 1, minutes: 1 })).toBe(
      "Too many failed attempts. Sign-in is temporarily locked; try again in 1 minute.",
    );
    expect(tr("en", "login.error_rate_limited_seconds", { count: 45, seconds: 45 })).toBe(
      "Too many failed attempts. Sign-in is temporarily locked; try again in 45 seconds.",
    );
    expect(tr("zh-CN", "login.error_rate_limited_minutes", { count: 5, minutes: 5 })).toBe(
      "尝试次数过多，登录已临时锁定，请 5 分钟后重试。",
    );
    expect(tr("ru", "login.error_rate_limited_minutes", { count: 5, minutes: 5 })).toBe(
      "Слишком много неудачных попыток. Вход временно заблокирован, повторите через 5 мин.",
    );
    expect(tr("ru", "login.locked_notice", { time: "4:32" })).toBe(
      "Слишком много неудачных попыток. Вход временно заблокирован, повторите через 4:32.",
    );
  });
});
