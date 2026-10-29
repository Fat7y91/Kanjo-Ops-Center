"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatBytes, prepareImage } from "@/lib/catalog/image";

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

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      setBytes(prepared.bytes);
      onChange(prepared.dataUrl);
    } catch {
      setError("تعذر معالجة الصورة. جرّب صورة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cat-image-field">
      <span className="cat-label">صورة المنتج</span>

      <div className="cat-image-body">
        <div className="cat-image-preview">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="معاينة صورة المنتج" />
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
