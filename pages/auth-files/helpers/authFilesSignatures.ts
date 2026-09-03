import type { AuthFileItem } from "@code-proxy/api-client";

export const buildAuthFileSignature = (file: AuthFileItem): string =>
  [
    file.name,
    file.type,
    file.provider,
    file.label,
    file.email,
    file.account_type,
    file.size,
    file.modified,
    file.modtime,
    file.authIndex,
    file.auth_index,
  ]
    .map((value) => String(value ?? ""))
    .join("|");

export const buildAuthFilesSignature = (items: AuthFileItem[]): string =>
  items.map(buildAuthFileSignature).sort().join("\n");

export const findChangedAuthFile = (
  previousFiles: AuthFileItem[],
  nextFiles: AuthFileItem[],
): AuthFileItem | null => {
  const previousSignatures = new Map(
    previousFiles.map((file) => [
      String(file.name ?? ""),
      buildAuthFileSignature(file),
    ]),
  );
  return (
    nextFiles.find((file) => {
      const name = String(file.name ?? "");
      return previousSignatures.get(name) !== buildAuthFileSignature(file);
    }) ?? null
  );
};
