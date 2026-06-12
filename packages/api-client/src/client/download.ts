export type BrowserFilePickerWindow = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<{
      createWritable: () => Promise<{
        write: (data: BufferSource | Blob | string) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

export const sanitizeDownloadFilename = (filename: string, fallback: string): string => {
  const sanitized = filename
    .replace(/[\\/]+/g, "-")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return fallback;
  }
  return sanitized.slice(0, 180);
};

export const extractDownloadFilename = (headers: Headers, fallback: string): string => {
  const safeFallback = sanitizeDownloadFilename(fallback, "download");
  const header = headers.get("Content-Disposition")?.trim();
  if (!header) return safeFallback;

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return sanitizeDownloadFilename(decodeURIComponent(utf8Match[1]), safeFallback);
    } catch {
      return sanitizeDownloadFilename(utf8Match[1], safeFallback);
    }
  }

  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return sanitizeDownloadFilename(quotedMatch[1], safeFallback);

  const plainMatch = header.match(/filename=([^;]+)/i);
  return sanitizeDownloadFilename(plainMatch?.[1]?.trim() || safeFallback, safeFallback);
};
