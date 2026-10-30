import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  CREDENTIALS_FILE,
  prometheusScrapeConfig,
  scrapeTarget,
} from "@pages/config/observability/scrapeConfig";

describe("scrapeTarget", () => {
  test("points at the backend the panel talks to", () => {
    expect(scrapeTarget("https://relay.example.test", "/metrics")).toEqual({
      scheme: "https",
      host: "relay.example.test",
      metricsPath: "/metrics",
      url: "https://relay.example.test/metrics",
    });
  });

  test("keeps the path prefix of a backend behind a reverse proxy, and its port", () => {
    expect(scrapeTarget("http://10.0.0.5:8318/relay/", "metrics")).toEqual({
      scheme: "http",
      host: "10.0.0.5:8318",
      metricsPath: "/relay/metrics",
      url: "http://10.0.0.5:8318/relay/metrics",
    });
  });

  test("gives up on an address it cannot scrape", () => {
    expect(scrapeTarget("", "/metrics")).toBeNull();
    expect(scrapeTarget("ftp://relay.example.test", "/metrics")).toBeNull();
  });
});

describe("prometheusScrapeConfig", () => {
  test("is a valid scrape config that reads the token from a file", () => {
    const target = scrapeTarget("https://relay.example.test/relay", "/metrics");
    expect(target).not.toBeNull();
    const parsed = parseYaml(prometheusScrapeConfig(target!, CREDENTIALS_FILE));

    expect(parsed).toEqual({
      scrape_configs: [
        {
          job_name: "clirelay",
          scheme: "https",
          metrics_path: "/relay/metrics",
          authorization: { type: "Bearer", credentials_file: CREDENTIALS_FILE },
          static_configs: [{ targets: ["relay.example.test"] }],
        },
      ],
    });
  });
});
