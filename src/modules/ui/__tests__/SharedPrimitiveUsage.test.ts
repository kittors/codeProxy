import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(__dirname, "../../..");

const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("shared primitive usage", () => {
  test("models page reuses shared cards and text inputs", () => {
    const source = readModule("modules/models/ModelsPage.tsx");

    expect(source).toContain('from "@/modules/ui/Card"');
    expect(source).toContain('from "@/modules/ui/Input"');
    expect(source).not.toContain("<input");
    expect(source).not.toContain("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm");
    expect(source).not.toContain("flex flex-1 flex-col rounded-2xl border border-black/[0.06]");
  });

  test("api key lookup panels reuse shared cards and text inputs", () => {
    const searchSource = readModule("modules/apikey-lookup/components/LookupSearchSection.tsx");
    const logsSource = readModule("modules/apikey-lookup/components/PublicLogsSection.tsx");
    const modelsSource = readModule("modules/apikey-lookup/components/ModelsTabContent.tsx");

    expect(searchSource).toContain('from "@/modules/ui/Card"');
    expect(searchSource).toContain('from "@/modules/ui/Input"');
    expect(searchSource).not.toContain("<input");
    expect(logsSource).toContain('from "@/modules/ui/Card"');
    expect(logsSource).not.toContain("overflow-hidden rounded-2xl border border-black/[0.06]");
    expect(modelsSource).toContain('from "@/modules/ui/Card"');
    expect(modelsSource).toContain('from "@/modules/ui/Input"');
    expect(modelsSource).not.toContain("<input");
  });

  test("auth files page uses shared tabs and cards for page-level controls", () => {
    const presentationSource = readModule(
      "modules/auth-files/hooks/useAuthFilesFilesPresentation.tsx",
    );
    const filesTabSource = readModule("modules/auth-files/components/AuthFilesFilesTab.tsx");

    expect(presentationSource).toContain('from "@/modules/ui/Tabs"');
    expect(presentationSource).not.toContain('role="tablist"');
    expect(filesTabSource).toContain('from "@/modules/ui/Card"');
    expect(filesTabSource).toContain('from "@/modules/ui/Tabs"');
    expect(filesTabSource).not.toContain(
      "rounded-2xl border border-slate-200 bg-white/70 px-3 py-3 shadow-sm",
    );
    expect(filesTabSource).not.toContain(
      "inline-flex w-fit max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-2xl",
    );
  });

  test("auth files channel surfaces transition naturally between themes", () => {
    const aliasSource = readModule("modules/auth-files/components/AuthFilesAliasTab.tsx");
    const excludedSource = readModule("modules/auth-files/components/AuthFilesExcludedTab.tsx");
    const filesTabSource = readModule("modules/auth-files/components/AuthFilesFilesTab.tsx");

    expect(aliasSource).toContain("transition-colors duration-200 ease-out");
    expect(excludedSource).toContain("transition-colors duration-200 ease-out");
    expect(filesTabSource).toContain("transition-colors duration-200 ease-out");
  });

  test("system page and api key form reuse shared card and input primitives", () => {
    const systemSource = readModule("modules/system/SystemPage.tsx");
    const formSource = readModule("modules/api-keys/components/ApiKeyFormFields.tsx");

    expect(systemSource).toContain('from "@/modules/ui/Card"');
    expect(systemSource).not.toContain("rounded-2xl border border-slate-200 bg-white/70 shadow-sm");
    expect(formSource).toContain('from "@/modules/ui/Input"');
    expect(formSource).not.toContain("<input");
  });
});
