"use client";

import type { CatalogDraft } from "@/lib/catalog/draft-queue";

type DraftQueueBannerProps = {
  drafts: CatalogDraft[];
  syncing: boolean;
  online: boolean;
  onUploadAll: () => void;
  onRemove: (clientProductId: string) => void;
};

/**
 * Persistent draft queue widget.
 *
 * Always visible when work is pending so a rep can see exactly how much data is
 * still local, which rows failed, and what the last error was. Nothing is
 * removed automatically without a server acknowledgement.
 */
export function DraftQueueBanner({
  drafts,
  syncing,
  online,
  onUploadAll,
  onRemove,
}: DraftQueueBannerProps) {
  if (drafts.length === 0) return null;

  const failed = drafts.filter((draft) => draft.lastError !== null);
  const totalBytes = drafts.reduce(
    (total, draft) => total + (draft.payload.imageDataUrl?.length ?? 0),
    0,
  );

  return (
    <section className="cat-queue" aria-label="مسودات المنتجات">
      <div className="cat-queue-head">
        <div className="cat-queue-titles">
          <span className="cat-queue-count">
            {drafts.length} منتج في المسودة
          </span>
          <span className="cat-queue-sub">
            {online
              ? "محفوظة محلياً — الرفع يدوي فقط"
              : "غير متصل — محفوظة محلياً حتى ترفعها يدوياً"}
            {failed.length > 0
              ? ` · ${failed.length} بحاجة إلى إعادة محاولة`
              : ""}
            {totalBytes > 0 ? ` · ${Math.round(totalBytes / 1024)} KB صور` : ""}
          </span>
        </div>

        <button
          type="button"
          className="button button-primary button-small"
          onClick={onUploadAll}
          disabled={syncing}
        >
          {syncing ? "جارٍ الرفع…" : "رفع الكل الآن"}
        </button>
      </div>

      <ul className="cat-queue-list">
        {drafts.map((draft) => (
          <li key={draft.clientProductId} className="cat-queue-item">
            <div className="cat-queue-item-main">
              <strong>{draft.payload.name}</strong>
              <span className="cat-queue-item-meta">
                {draft.payload.merchantName} ·{" "}
                {draft.payload.sku || "SKU تلقائي"}
              </span>
              {draft.lastError ? (
                <span className="cat-queue-error" role="status">
                  {draft.lastError}
                  {draft.attempts > 0 ? ` (محاولة ${draft.attempts})` : ""}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="button button-small button-quiet"
              onClick={() => onRemove(draft.clientProductId)}
              aria-label={`حذف مسودة ${draft.payload.name}`}
            >
              حذف
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
