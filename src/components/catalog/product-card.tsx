"use client";

import type { MouseEvent } from "react";

import { ImageQaActions } from "@/components/catalog/image-qa-actions";
import { Protect } from "@/components/auth/protect";
import { formatPrice } from "@/lib/catalog/format";
import {
  PRODUCT_STATE_META,
  needsImageQa,
  type CatalogProduct,
} from "@/lib/catalog/types";

type ProductCardProps = {
  product: CatalogProduct;
  qaBusy: boolean;
  onOpenDetails: (product: CatalogProduct) => void;
  onOpenImage: (product: CatalogProduct) => void;
  onDownloadOriginal: (product: CatalogProduct) => void;
  onApprove: (product: CatalogProduct) => void;
  onUploadEnhanced: (product: CatalogProduct, dataUrl: string) => void;
};

/**
 * Catalog grid card. Clicking anywhere opens the details modal; the thumbnail
 * is a separate hit target that opens the lightbox without opening details.
 */
export function ProductCard({
  product,
  qaBusy,
  onOpenDetails,
  onOpenImage,
  onDownloadOriginal,
  onApprove,
  onUploadEnhanced,
}: ProductCardProps) {
  const meta = PRODUCT_STATE_META[product.state];

  function stop(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <article
      className="product-card is-clickable"
      onClick={() => onOpenDetails(product)}
    >
      <button
        type="button"
        className="product-thumb"
        onClick={(event) => {
          stop(event);
          if (product.imageDataUrl) onOpenImage(product);
          else onOpenDetails(product);
        }}
        aria-label={
          product.imageDataUrl
            ? `عرض صورة ${product.name} بالحجم الكامل`
            : `تفاصيل ${product.name}`
        }
      >
        {product.imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageDataUrl} alt="" />
        ) : (
          <span>{product.name.slice(0, 2)}</span>
        )}
      </button>

      <div className="product-body">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">{product.merchantName}</p>
            <h2>{product.name}</h2>
          </div>
          <span className={`badge ${meta.tone}`}>{meta.label}</span>
        </div>

        {product.description ? (
          <p className="product-description">{product.description}</p>
        ) : null}

        <div className="product-meta">
          <strong>{formatPrice(product.price)}</strong>
          <span className="product-sku" dir="ltr">
            {product.sku}
          </span>
        </div>

        <div className="product-tags">
          <span className="badge">
            {product.productType === "variable" ? "متغير" : "بسيط"}
          </span>
          {product.barcode ? (
            <span className="badge" dir="ltr">
              {product.barcode}
            </span>
          ) : null}
          <span className="badge">{product.reviewNote}</span>
        </div>

        {needsImageQa(product.state) ? (
          <div onClick={stop}>
            <Protect
              require={["manage_catalog", "edit_products"]}
              mode="any"
            >
              <ImageQaActions
                product={product}
                busy={qaBusy}
                onDownload={() => onDownloadOriginal(product)}
                onApprove={() => onApprove(product)}
                onUploadEnhanced={(dataUrl) =>
                  onUploadEnhanced(product, dataUrl)
                }
              />
            </Protect>
          </div>
        ) : (
          <div className="row-actions" onClick={stop}>
            <button
              type="button"
              className="button button-small button-quiet"
              onClick={() => onOpenDetails(product)}
            >
              التفاصيل
            </button>
            <Protect require="edit_products">
              <button
                type="button"
                className="button button-small button-quiet"
                disabled
                title="تعديل المنتجات يمر عبر مسار المراجعة."
              >
                تعديل
              </button>
            </Protect>
            <Protect require="delete_products">
              <button
                type="button"
                className="button button-small button-danger"
                disabled
                title="الحذف يمر عبر مسار المراجعة."
              >
                حذف
              </button>
            </Protect>
          </div>
        )}
      </div>
    </article>
  );
}
