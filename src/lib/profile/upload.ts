/**
 * Upload admission rules for the two profile buckets.
 *
 * The bucket configuration in SQL sets a size and MIME allow-list, but that is
 * enforced by Storage after the bytes have been accepted. These checks run
 * before anything is forwarded, and add a magic-number sniff so a file that
 * merely claims `image/png` cannot be stored as a script.
 */

export type UploadTarget = "avatars" | "capital-receipts";

type BucketRules = {
  maxBytes: number;
  mimeTypes: readonly string[];
  extensionFor: (mime: string) => string;
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const RULES: Record<UploadTarget, BucketRules> = {
  avatars: {
    maxBytes: 2 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    extensionFor: (mime) => IMAGE_EXTENSIONS[mime] ?? "bin",
  },
  "capital-receipts": {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    extensionFor: (mime) => IMAGE_EXTENSIONS[mime] ?? "pdf",
  },
};

export class UploadError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.status = status;
  }
}

export function isUploadTarget(value: unknown): value is UploadTarget {
  return value === "avatars" || value === "capital-receipts";
}

/** Leading bytes that identify each accepted format. */
function matchesSignature(mime: string, bytes: Uint8Array): boolean {
  switch (mime) {
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      );
    case "image/webp":
      return (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
    case "application/pdf":
      return (
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46
      );
    default:
      return false;
  }
}

export type Admission = {
  bucket: UploadTarget;
  mime: string;
  extension: string;
  bytes: Uint8Array;
};

/**
 * Validates a form-data file for a target bucket and returns what to upload.
 *
 * The object path is derived from the session subject and a random uuid, never
 * from the submitted filename, so a crafted name cannot traverse into another
 * operator's folder or overwrite someone else's object.
 */
export async function admitUpload(
  target: UploadTarget,
  file: File,
): Promise<Admission> {
  const rules = RULES[target];
  const mime = file.type.toLowerCase();

  if (!rules.mimeTypes.includes(mime)) {
    throw new UploadError(
      "UNSUPPORTED_TYPE",
      "صيغة الملف غير مدعومة.",
    );
  }
  if (file.size === 0) {
    throw new UploadError("EMPTY_FILE", "الملف فارغ.");
  }
  if (file.size > rules.maxBytes) {
    throw new UploadError(
      "FILE_TOO_LARGE",
      `حجم الملف يتجاوز الحد (${Math.round(rules.maxBytes / 1024 / 1024)} ميجابايت).`,
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(mime, bytes)) {
    throw new UploadError(
      "CONTENT_MISMATCH",
      "محتوى الملف لا يطابق صيغته.",
    );
  }

  return { bucket: target, mime, extension: rules.extensionFor(mime), bytes };
}

/** Server-owned object path: `<subject>/<uuid>.<ext>`. */
export function objectPath(
  ownerId: string,
  extension: string,
): string {
  return `${ownerId}/${crypto.randomUUID()}.${extension}`;
}
