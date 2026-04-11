/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

export type AuthFileType =
  | "qwen"
  | "kimi"
  | "gemini"
  | "gemini-cli"
  | "aistudio"
  | "claude"
  | "codex"
  | "antigravity"
  | "iflow"
  | "vertex"
  | "empty"
  | "unknown";

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  label?: string;
  email?: string;
  plan_type?: string;
  planType?: string;
  account_type?: string;
  account?: string;
  size?: number;
  authIndex?: string | number | null;
  auth_index?: string | number | null;
  runtimeOnly?: boolean | string;
  runtime_only?: boolean | string;
  disabled?: boolean;
  modified?: number;
  modtime?: number;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}
