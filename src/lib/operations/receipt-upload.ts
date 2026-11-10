import "server-only";

import { matchesSignature } from "@/lib/profile/upload";

/**
 * Upload admission for transaction receipts.
 *
 * Mirrors the profile buckets: the MIME allow-list is checked before anything
 * is forwarded and the bytes are sniffed so a file that merely claims
 * `application/pdf` cannot be stored as a script. Kept separate from the
 * profile rules because a receipt has its own size ceiling and path scheme.
 */

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export class ReceiptError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "ReceiptError";
    this.code = code;
    this.status = status;
  }
}

export type ReceiptAdmission = {
  mime: string;
  bytes: Uint8Array;
  extension: string;
};

export async function admitReceipt(file: File): Promise<ReceiptAdmission> {
  const mime = file.type.toLowerCase();

  if (!RECEIPT_MIME_TYPES.includes(mime as (typeof RECEIPT_MIME_TYPES)[number])) {
    throw new ReceiptError("UNSUPPORTED_TYPE", "صيغة الإيصال غير مدعومة.");
  }
  if (file.size === 0) {
    throw new ReceiptError("EMPTY_FILE", "الملف فارغ.");
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new ReceiptError(
      "FILE_TOO_LARGE",
      `حجم الإيصال يتجاوز الحد (${Math.round(RECEIPT_MAX_BYTES / 1024 / 1024)} ميجابايت).`,
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(mime, bytes)) {
    throw new ReceiptError("CONTENT_MISMATCH", "محتوى الإيصال لا يطابق صيغته.");
  }

  return { mime, bytes, extension: EXTENSIONS[mime] ?? "bin" };
}

/** Server-owned object path: `settlements/<uuid>.<ext>`. */
export function receiptObjectPath(extension: string): string {
  return `settlements/${crypto.randomUUID()}.${extension}`;
}
