"use client";

import { useRef } from "react";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/catalog/format";
import type { CatalogProduct } from "@/lib/catalog/types";

type ImageQaCardProps = {
  product: CatalogProduct;
  busy: boolean;
  preparing: boolean;
  onDownload: () => void;
  onApprove: () => void;
  onUploadEnhanced: (file: File) => void;
  onOpenImage: () => void;
};

/**
 * Product card for the dedicated Image QA workspace.
 *
 * Presentation only: it renders the pending product, its image and the three
 * review exits. All behaviour is dispatched upward to the view controller.
 */
export function ImageQaCard({
  product,
  busy,
  preparing,
  onDownload,
  onApprove,
  onUploadEnhanced,
  onOpenImage,
}: ImageQaCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = busy || preparing;
  const hasImage = Boolean(product.imageDataUrl);

  return (
    <article className="img-qa-card">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUploadEnhanced(file);
        }}
      />

      <button
        type="button"
        className="img-qa-thumb"
        onClick={onOpenImage}
        disabled={!hasImage}
        aria-label={
          hasImage
            ? `عرض صورة ${product.name} بالحجم الكامل`
            : `لا توجد صورة لـ ${product.name}`
        }
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageDataUrl ?? ""} alt="" />
        ) : (
          <span aria-hidden="true">{product.name.slice(0, 2)}</span>
        )}
      </button>

      <div className="img-qa-body">
        <div className="img-qa-head">
          <div>
            <p className="eyebrow">{product.merchantName}</p>
            <h2>{product.name}</h2>
          </div>
          <span className="badge badge-gold">بانتظار المراجعة</span>
        </div>

        <div className="img-qa-meta">
          <strong>{formatPrice(product.price)}</strong>
          <span className="product-sku" dir="ltr">
            {product.sku}
          </span>
        </div>

        <div className="img-qa-bar" role="group" aria-label="إجراءات مراجعة الصورة">
          <Button
            size="sm"
            variant="quiet"
            onClick={onDownload}
            disabled={!hasImage || locked}
            title={hasImage ? undefined : "لا توجد صورة لتحميلها."}
          >
            تحميل
          </Button>

          <Button
            size="sm"
            variant="quiet"
            onClick={() => inputRef.current?.click()}
            disabled={locked}
          >
            {preparing ? "جارٍ المعالجة…" : "رفع المحسنة"}
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={onApprove}
            disabled={locked}
          >
            اعتماد مباشر
          </Button>

          <DropdownMenu
            label="خيارات"
            items={[
              {
                id: "download",
                label: "تحميل الصورة الأصلية",
                onSelect: onDownload,
                disabled: !hasImage || locked,
              },
              {
                id: "preview",
                label: "عرض بالحجم الكامل",
                onSelect: onOpenImage,
                disabled: !hasImage,
              },
            ]}
          />
        </div>

        {busy ? (
          <p className="cat-hint" role="status">
            جارٍ اعتماد الصورة…
          </p>
        ) : null}
      </div>
    </article>
  );
}
