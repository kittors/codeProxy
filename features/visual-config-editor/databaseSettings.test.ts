import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  databaseInteger,
  effectiveConfigDocument,
  isDatabaseSetting,
  type LiveConfig,
} from "./databaseSettings";
import { useVisualConfig } from "./useVisualConfig";

const STORED_STORAGE = {
  "store-content": true,
  "retention-days": 7,
  "cleanup-enabled": true,
  "cleanup-interval-minutes": 60,
  "cleanup-batch-size": 500,
  "cleanup-max-runtime-seconds": 30,
};

/** 后端保存后 config.yaml 里只剩节点自己的设置，数据库里那些只能从运行中的配置读到。 */
const LIVE: LiveConfig = {
  // GET /proxy-url：原文，账号密码按 URL 编码。
  proxyUrl: "socks5://relay:p%40ss@203.0.113.7:1080",
  config: {
    port: 8318,
    // 节点自己的设置在 config.yaml 里，不从运行中的配置取。
    "prefer-ipv4": true,
    // GET /config 把代理脱敏成「协议 + 主机」。
    "proxy-url": "socks5://203.0.113.7:1080/***",
    debug: true,
    "request-retry": 5,
    "max-retry-interval": 30,
    "quota-exceeded": { "switch-project": false, "switch-preview-model": true },
    "force-model-prefix": false,
    "ws-auth": true,
    "request-log": true,
    "logging-to-file": false,
    "logs-max-total-size-mb": 512,
    "error-logs-max-files": 10,
    "usage-statistics-enabled": true,
    // omitempty：值为 0 的整数不出现在 JSON 里。
    "request-log-storage": STORED_STORAGE,
    "kimi-header-defaults": { "user-agent": "KimiCLI/1.10.6", platform: "", version: "" },
    payload: {
      default: null,
      "default-raw": null,
      override: null,
      "override-raw": null,
      filter: null,
    },
  },
};

describe("effectiveConfigDocument", () => {
  test("fills the settings config.yaml no longer holds from the running config", () => {
    const doc = effectiveConfigDocument({ port: 8318 }, LIVE);

    expect(doc).toMatchObject({
      port: 8318,
      debug: true,
      "request-retry": 5,
      "quota-exceeded": { "switch-project": false, "switch-preview-model": true },
      "proxy-url": "socks5://relay:p%40ss@203.0.113.7:1080",
    });
    expect(doc).not.toHaveProperty("prefer-ipv4");
    // 缺的整数补成 0（「不限」），不能被页面默认值顶替。
    expect(doc["request-log-storage"]).toEqual({
      ...STORED_STORAGE,
      "content-retention-days": 0,
      "max-rows": 0,
      "max-metadata-size-mb": 0,
      "max-total-size-mb": 0,
    });
  });

  test("what config.yaml spells out wins over the running value", () => {
    const doc = effectiveConfigDocument(
      { debug: false, "proxy-url": "http://10.0.0.1:3128" },
      LIVE,
    );

    expect(doc.debug).toBe(false);
    expect(doc["proxy-url"]).toBe("http://10.0.0.1:3128");
  });

  test("is the file itself when the running config could not be read", () => {
    expect(effectiveConfigDocument({ port: 8318 }, null)).toEqual({ port: 8318 });
  });

  test("hands out copies, so editing the document never touches the snapshot", () => {
    const doc = effectiveConfigDocument({}, LIVE);
    (doc["request-log-storage"] as Record<string, unknown>)["max-rows"] = 5;

    expect(LIVE.config["request-log-storage"]).not.toHaveProperty("max-rows");
  });
});

test.each([
  ["proxy-url", true],
  ["request-log-storage.max-rows", true],
  ["kimi-header-defaults.user-agent", true],
  ["quota-exceeded.switch-project", true],
  ["prefer-ipv4", false],
  ["streaming.keepalive-seconds", false],
  ["auto-update.channel", false],
  ["host", false],
])("isDatabaseSetting(%s) is %s", (yamlKey, expected) => {
  expect(isDatabaseSetting(yamlKey)).toBe(expected);
});

test.each([
  ["", null],
  [" 3 ", 3],
  ["-1", -1],
  ["1.5", null],
  ["abc", null],
])("databaseInteger(%j) is %s", (text, expected) => {
  expect(databaseInteger(text)).toBe(expected);
});

describe("useVisualConfig with settings stored in the database", () => {
  function loaded(yaml = "port: 8318\n") {
    const hook = renderHook(() => useVisualConfig());
    act(() => hook.result.current.loadVisualValuesFromYaml(yaml, LIVE));
    return hook;
  }

  /** 保存时写出的、存在数据库里的那些键（节点自己的设置照旧会写出默认值，与这里无关）。 */
  const save = (hook: ReturnType<typeof loaded>, yaml = "port: 8318\n") => {
    const doc = parseYaml(hook.result.current.applyVisualChangesToYaml(yaml, LIVE)) as Record<
      string,
      unknown
    >;
    return Object.fromEntries(Object.entries(doc).filter(([key]) => isDatabaseSetting(key)));
  };

  test("shows the running value of every setting the file no longer holds", () => {
    const { result } = loaded();

    expect(result.current.visualValues).toMatchObject({
      proxyUrl: "socks5://relay:p%40ss@203.0.113.7:1080",
      debug: true,
      requestRetry: "5",
      maxRetryInterval: "30",
      quotaSwitchProject: false,
      quotaSwitchPreviewModel: true,
      wsAuth: true,
      requestLog: true,
      usageStatisticsEnabled: true,
      logsMaxTotalSizeMb: "512",
      requestLogStorage: { storeContent: true, maxRows: "0", contentRetentionDays: "0" },
      kimiHeaderDefaults: { userAgent: "KimiCLI/1.10.6" },
    });
  });

  test("an untouched save writes none of them back", () => {
    // 写回去就会拿打开页面时的值盖掉别人在这期间的修改。
    expect(save(loaded())).toEqual({});
  });

  test("writes the changed ones explicitly, including switched off and cleared", () => {
    const hook = loaded();
    act(() =>
      hook.result.current.setVisualValues({
        proxyUrl: "",
        debug: false,
        requestRetry: "",
        wsAuth: false,
      }),
    );

    // 清空代理写空串、清空数字写 null（后端取默认值），不写的话数据库里的旧值原样保留。
    expect(save(hook)).toEqual({
      "proxy-url": "",
      debug: false,
      "request-retry": null,
      "ws-auth": false,
    });
  });

  test("changing one storage field keeps the sub-keys the page does not edit", () => {
    const hook = loaded();
    act(() =>
      hook.result.current.setVisualValues({
        requestLogStorage: {
          ...hook.result.current.visualValues.requestLogStorage,
          maxRows: "2000",
        },
      }),
    );

    expect(save(hook)["request-log-storage"]).toEqual({
      ...STORED_STORAGE,
      "content-retention-days": 0,
      "max-rows": 2000,
      "max-metadata-size-mb": 0,
      "max-total-size-mb": 0,
    });
  });

  test("clearing the Kimi headers writes an empty block so the stored ones go away", () => {
    const hook = loaded();
    act(() =>
      hook.result.current.setVisualValues({
        kimiHeaderDefaults: { userAgent: "", platform: "", version: "" },
      }),
    );

    expect(save(hook)["kimi-header-defaults"]).toEqual({});
  });

  test("unsaved edits in the file win over the running value and survive the save", () => {
    const yaml = "port: 8318\nproxy-url: http://10.0.0.1:3128\n";
    const hook = loaded(yaml);

    expect(hook.result.current.visualValues.proxyUrl).toBe("http://10.0.0.1:3128");
    expect(save(hook, yaml)).toEqual({ "proxy-url": "http://10.0.0.1:3128" });
  });
});
