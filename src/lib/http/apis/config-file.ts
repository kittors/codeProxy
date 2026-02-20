import { apiClient } from "@/lib/http/client";

export const configFileApi = {
  fetchConfigYaml: () =>
    apiClient.getText("/config.yaml", {
      headers: { Accept: "application/yaml, text/yaml, text/plain" },
      timeoutMs: 60000,
    }),
  saveConfigYaml: (content: string) =>
    apiClient.putRawText("/config.yaml", content, {
      headers: {
        "Content-Type": "application/yaml",
        Accept: "application/json, text/plain, */*",
      },
      timeoutMs: 60000,
    }),
};
