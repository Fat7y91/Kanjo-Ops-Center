/**
 * Image capture helpers for field product entry.
 *
 * Phone cameras produce 3-8 MB JPEGs. We downscale to an 800px box and re-encode
 * as JPEG (q82) before it ever reaches IndexedDB or the upload endpoint, so a
 * rep's whole draft queue stays comfortably inside browser quota limits.
 */

const MAX_EDGE = 800;
const QUALITY = 0.82;
const TARGET_LIMIT_BYTES = 400 * 1024;
const HARD_LIMIT_BYTES = 1_000_000;

export type PreparedImage = {
  dataUrl: string;
  bytes: number;
};

function approximateBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.round((base64.length * 3) / 4);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const raw = await readAsDataUrl(file);

  if (typeof document === "undefined") {
    return { dataUrl: raw, bytes: approximateBytes(raw) };
  }

  const image = await loadImage(raw);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return { dataUrl: raw, bytes: approximateBytes(raw) };
  }
  context.drawImage(image, 0, 0, width, height);

  let dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  if (approximateBytes(dataUrl) > TARGET_LIMIT_BYTES) {
    dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  }
  if (approximateBytes(dataUrl) > HARD_LIMIT_BYTES) {
    dataUrl = canvas.toDataURL("image/jpeg", 0.5);
  }

  return { dataUrl, bytes: approximateBytes(dataUrl) };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image-decode-failed"));
    image.src = src;
  });
}

/** First image file on a paste event, if any. */
export function clipboardImageFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
