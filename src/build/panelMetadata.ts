import { execSync } from "node:child_process";
import type { Plugin } from "vite";

export interface PanelMetadata {
  version: string;
  ref: string;
  commit: string;
  repository: string;
  build_date: string;
}

interface PanelMetadataInput {
  appVersion?: string;
  buildDate?: string;
  commit?: string;
  ref?: string;
  repository?: string;
}

function shortCommit(commit: string): string {
  const trimmed = commit.trim();
  return trimmed.length > 7 ? trimmed.slice(0, 7) : trimmed;
}

function normalizeRef(ref?: string): string {
  const trimmed = ref?.trim() ?? "";
  if (!trimmed || trimmed === "HEAD") return "main";
  return trimmed;
}

function deriveVersion(appVersion: string | undefined, ref: string, commit: string): string {
  const trimmed = appVersion?.trim() ?? "";
  if (trimmed && trimmed !== "dev") return trimmed;
  if (!commit) return trimmed || "dev";
  return `panel-${ref}-${shortCommit(commit)}`;
}

function runGit(command: string): string {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function resolveGitMetadata(): PanelMetadataInput {
  return {
    commit: runGit("git rev-parse HEAD"),
    ref: runGit("git rev-parse --abbrev-ref HEAD"),
    repository: runGit("git config --get remote.origin.url"),
  };
}

export function createPanelMetadata(input: PanelMetadataInput): PanelMetadata {
  const ref = normalizeRef(input.ref);
  const commit = input.commit?.trim() ?? "";
  return {
    build_date: input.buildDate?.trim() || new Date().toISOString(),
    commit,
    ref,
    repository: input.repository?.trim() ?? "",
    version: deriveVersion(input.appVersion, ref, commit),
  };
}

export function resolvePanelMetadata(env: NodeJS.ProcessEnv = process.env): PanelMetadata {
  const git = resolveGitMetadata();
  return createPanelMetadata({
    appVersion: env.VITE_APP_VERSION ?? env.APP_VERSION,
    buildDate: env.VITE_PANEL_BUILD_DATE ?? env.BUILD_DATE,
    commit: env.VITE_PANEL_COMMIT ?? env.FRONTEND_COMMIT ?? git.commit,
    ref: env.VITE_PANEL_REF ?? env.FRONTEND_REF ?? git.ref,
    repository: env.VITE_PANEL_REPOSITORY ?? env.FRONTEND_REPOSITORY ?? git.repository,
  });
}

export function panelMetadataPlugin(env: NodeJS.ProcessEnv = process.env): Plugin {
  return {
    apply: "build",
    name: "panel-metadata",
    generateBundle() {
      const metadata = resolvePanelMetadata(env);
      this.emitFile({
        fileName: "panel-meta.json",
        source: JSON.stringify(metadata, null, 2) + "\n",
        type: "asset",
      });
    },
  };
}
