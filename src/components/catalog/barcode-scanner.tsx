"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { InputControl } from "@/components/ui/form-inputs";
import { isValidBarcode, normalizeCode } from "@/lib/catalog/sku";

type BarcodeScannerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * Barcode / SKU capture field.
 *
 * A hardware scanner behaves as a keyboard that types the code then presses
 * Enter, so a plain focused input is the correct integration. `BarcodeDetector`
 * is used only when the browser exposes it; otherwise the rep can still type or
 * paste the code.
 */
export function BarcodeScanner({
  value,
  onChange,
  disabled = false,
}: BarcodeScannerProps) {
  const inputId = useId();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const invalid = !isValidBarcode(value);

  async function startCameraScan() {
    setError("");
    const Detector = (
      globalThis as unknown as {
        BarcodeDetector?: new (options?: { formats?: string[] }) => {
          detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;

    if (!Detector) {
      setError("المتصفح لا يدعم مسح الباركود بالكاميرا. أدخل الرمز يدوياً.");
      return;
    }

    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.playsInline = true;
      await video.play();

      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a"] });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          onChange(normalizeCode(codes[0].rawValue));
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setError("تعذر الوصول إلى الكاميرا. أدخل الرمز يدوياً.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="cat-field">
      <label className="cat-label" htmlFor={inputId}>
        الباركود / SKU <span className="cat-optional">اختياري</span>
      </label>

      <div className="cat-code-row">
        <InputControl
          id={inputId}
          className="cat-code-input h-9 py-1.5 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(normalizeCode(value))}
          placeholder="اتركه فارغاً ليُولَّد تلقائياً"
          inputMode="numeric"
          autoComplete="off"
          maxLength={64}
          disabled={disabled}
          dir="ltr"
        />
        <Button
          size="sm"
          onClick={() => void startCameraScan()}
          disabled={disabled || scanning}
        >
          {scanning ? "جارٍ المسح…" : "مسح"}
        </Button>
      </div>

      <p className="cat-hint">
        {invalid
          ? "الباركود يجب أن يكون من 8 إلى 14 رقماً."
          : value
            ? "سيُستخدم هذا الرمز كما هو."
            : "سيولّد النظام رمز SKU فريداً عند الحفظ."}
      </p>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
