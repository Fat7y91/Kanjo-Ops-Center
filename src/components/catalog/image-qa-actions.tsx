"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CatalogProduct } from "@/lib/catalog/types";
import { formatBytes, prepareImage } from "@/lib/catalog/image";

type ImageQaActionsProps = {
  product: CatalogProduct;
  busy: boolean;
  onDownload: () => void;
  onApprove: () => void;
  onUploadEnhanced: (dataUrl: string) => void;
};

/**
 * Image QA action bar for products awaiting review.
 *
 * Three explicit exits: download the original for offline retouching, upload a
 * retouched replacement, or approve the current image untouched. Every path
 * moves the product to `completed`.
 */
export function ImageQaActions({
  product,
  busy,
  onDownload,
  onApprove,
  onUploadEnhanced,
}: ImageQaActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [pendingBytes, setPendingBytes] = useState(0);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setPreparing(true);
    try {
      const prepared = await prepareImage(file);
      setPendingBytes(prepared.bytes);
      onUploadEnhanced(prepared.dataUrl);
    } catch {
      setError("تعذر معالجة الصورة المحسّنة. جرّب صورة أخرى.");
    } finally {
      setPreparing(false);
    }
  }

  const hasImage = Boolean(product.imageDataUrl);

  return (
    <div className="img-qa-bar" role="group" aria-label="إجراءات مراجعة الصورة">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void handleFile(file);
        }}
      />

      <Button
        size="sm"
        variant="quiet"
        onClick={onDownload}
        disabled={!hasImage || busy || preparing}
        title={hasImage ? undefined : "لا توجد صورة لتحميلها."}
      >
        تحميل الصورة الأصلية
      </Button>

      <Button
        size="sm"
        variant="quiet"
        onClick={() => inputRef.current?.click()}
        disabled={busy || preparing}
      >
        {preparing ? "جارٍ المعالجة…" : "رفع الصورة المحسنة"}
      </Button>

      <Button
        size="sm"
        variant="primary"
        onClick={onApprove}
        disabled={busy || preparing}
      >
        اعتماد مباشر
      </Button>

      {pendingBytes > 0 ? (
        <span className="img-qa-size">{formatBytes(pendingBytes)}</span>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
