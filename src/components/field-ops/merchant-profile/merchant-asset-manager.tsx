"use client";

import { useRef, useState } from "react";

import { CatalogImage } from "@/components/catalog/catalog-image";
import { Button } from "@/components/ui/button";
import { MerchantAvatar } from "@/components/merchants/merchant-avatar";

type MerchantAssetManagerProps = {
  merchantId: string;
  merchantName: string;
  logoUrl: string | null;
  coverUrl: string | null;
  canEdit: boolean;
};

type AssetState = {
  logoUrl: string | null;
  coverUrl: string | null;
};

/**
 * Logo and cover management for one merchant.
 *
 * The merchant row is the single source of truth: each upload both stores the
 * image and persists its URL, and this component only mirrors the URL the server
 * returns. There is no local "pending" image that can drift from the database.
 */
export function MerchantAssetManager({
  merchantId,
  merchantName,
  logoUrl,
  coverUrl,
  canEdit,
}: MerchantAssetManagerProps) {
  const [assets, setAssets] = useState<AssetState>({ logoUrl, coverUrl });
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  async function upload(kind: "logo" | "cover", file: File) {
    setUploading(kind);
    setError(null);
    setMessage(null);

    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);

    try {
      const response = await fetch(
        `/api/field-ops/merchants/${merchantId}/assets`,
        { method: "POST", body },
      );
      const payload = (await response.json()) as {
        error?: string;
        logoUrl?: string | null;
        coverUrl?: string | null;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر رفع الصورة.");
      }

      setAssets({
        logoUrl: payload.logoUrl ?? null,
        coverUrl: payload.coverUrl ?? null,
      });
      setMessage(kind === "logo" ? "تم تحديث الشعار." : "تم تحديث الغلاف.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "تعذر رفع الصورة.",
      );
    } finally {
      setUploading(null);
    }
  }

  function pick(kind: "logo" | "cover", input: HTMLInputElement | null) {
    if (!canEdit || uploading) return;
    input?.click();
  }

  return (
    <section className="panel merchant-assets" aria-label="الشعار والغلاف">
      <div className="merchant-assets-head">
        <div>
          <p className="eyebrow">أصول العلامة</p>
          <h3>الشعار والغلاف</h3>
        </div>
        <span className="muted">
          {canEdit ? "صور فورية في الكتالوج مباشرة بعد الحفظ." : "للقراءة فقط."}
        </span>
      </div>

      <div className="merchant-assets-preview">
        <div className="merchant-assets-cover">
          {assets.coverUrl ? (
            <CatalogImage src={assets.coverUrl} alt="" loading="lazy" />
          ) : (
            <span className="merchant-assets-cover-fallback">لا يوجد غلاف</span>
          )}
        </div>
        <span className="merchant-assets-logo">
          <MerchantAvatar
            name={merchantName}
            logoUrl={assets.logoUrl}
            size="xl"
            elevated
          />
        </span>
      </div>

      <div className="merchant-assets-actions">
        <input
          ref={logoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload("logo", file);
          }}
        />
        <input
          ref={coverInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload("cover", file);
          }}
        />

        <Button
          size="sm"
          variant="quiet"
          onClick={() => pick("logo", logoInput.current)}
          disabled={!canEdit || uploading !== null}
        >
          {uploading === "logo" ? "جارٍ رفع الشعار…" : "رفع شعار"}
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => pick("cover", coverInput.current)}
          disabled={!canEdit || uploading !== null}
        >
          {uploading === "cover" ? "جارٍ رفع الغلاف…" : "رفع غلاف"}
        </Button>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="cat-hint" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
