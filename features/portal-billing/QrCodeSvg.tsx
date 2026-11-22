import { useMemo } from "react";
import { encodeQrMatrix } from "./qrCode";

export function QrCodeSvg({
  value,
  size = 200,
  label = "QR Code",
  className,
}: {
  value: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  const pathData = useMemo(() => {
    try {
      const matrix = encodeQrMatrix(value);
      const n = matrix.length;
      const quiet = 3;
      const total = n + quiet * 2;
      const parts: string[] = [];
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          if (matrix[r][c]) {
            parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
          }
        }
      }
      return { viewBox: `0 0 ${total} ${total}`, d: parts.join("") };
    } catch {
      return null;
    }
  }, [value]);

  if (!pathData) return null;

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={pathData.viewBox}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={pathData.d} fill="#111827" />
    </svg>
  );
}

/** Downloads a crisp PNG rendered from the QR matrix (for sharing in chat apps). */
export function downloadQrPng(value: string, filename: string, pixelSize = 600): void {
  const matrix = encodeQrMatrix(value);
  const n = matrix.length;
  const quiet = 4;
  const total = n + quiet * 2;
  const scale = Math.max(4, Math.floor(pixelSize / total));
  const dim = total * scale;
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = "#111827";
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (matrix[r][c]) {
        ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
  }
  const link = document.createElement("a");
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
