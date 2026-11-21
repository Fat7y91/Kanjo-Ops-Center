"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CatalogImage } from "@/components/catalog/catalog-image";
import {
  clipboardImageFile,
  formatBytes,
  prepareImage,
} from "@/lib/catalog/image";
import { uploadCatalogImage } from "@/lib/catalog/images/upload";

type ProductImageFieldProps = {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
};

/**
 * Camera / file capture for the product photo.
 *
 * The `capture="environment"` hint opens the rear camera on phones while still
 * allowing a gallery pick, so one control covers both field workflows.
 */
export function ProductImageField({
  value,
  onChange,
  disabled = false,
}: ProductImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bytes, setBytes] = useState(0);

  // A catalog reference arrives as a URL, so the upload-size label from an
  // earlier local capture no longer describes the preview.
  useEffect(() => {
    if (!value || !value.startsWith("data:")) setBytes(0);
  }, [value]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      setBytes(prepared.bytes);
      // Online capture stores the photo once and keeps only its URL. If the
      // upload cannot reach the server, the prepared data URL stays in the
      // draft and the server converts it when the product is written.
      let next = prepared.dataUrl;
      try {
        next = await uploadCatalogImage(prepared.dataUrl);
      } catch {
        next = prepared.dataUrl;
      }
      onChange(next);
    } catch {
      setError("تعذر معالجة الصورة. جرّب صورة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="cat-image-field"
      tabIndex={0}
      onPaste={(event) => {
        const file = clipboardImageFile(event.clipboardData);
        if (!file) return;
        event.preventDefault();
        void handleFile(file);
      }}
    >
      <span className="cat-label">صورة المنتج</span>

      <div className="cat-image-body">
        <div className="cat-image-preview">
          {value ? (
            <CatalogImage src={value} alt="معاينة صورة المنتج" />
          ) : (
            <span aria-hidden="true">لا توجد صورة</span>
          )}
        </div>

        <div className="cat-image-actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
          >
            {busy ? "جارٍ المعالجة…" : value ? "استبدال الصورة" : "التقاط / رفع"}
          </Button>
          {value ? (
            <Button
              size="sm"
              onClick={() => {
                onChange(null);
                setBytes(0);
                if (inputRef.current) inputRef.current.value = "";
              }}
              disabled={disabled || busy}
            >
              إزالة
            </Button>
          ) : null}
          {value && bytes > 0 ? (
            <span className="cat-image-size">{formatBytes(bytes)}</span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
