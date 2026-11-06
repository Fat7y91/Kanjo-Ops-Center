import Link from "next/link";

import { CatalogImage } from "@/components/catalog/catalog-image";
import { MerchantAvatar } from "@/components/merchants/merchant-avatar";
import type { CatalogMerchantCard as CatalogMerchantCardData } from "@/lib/catalog/merchants";
import { resolveDisplayImageUrl } from "@/lib/catalog/format";
import { CONTRACT_STATE_META } from "@/lib/field-ops/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0)).join("");
}

/**
 * One merchant tile in the catalog directory.
 *
 * The grid answers "which merchants have a catalog and how far along is it",
 * so the tile leads with the agreement state and the product counts instead of
 * a product name. The whole tile is a link: the product rows live on the
 * merchant route.
 */
export function CatalogMerchantCard({
  card,
}: {
  card: CatalogMerchantCardData;
}) {
  const meta = CONTRACT_STATE_META[card.contractState];
  const coverImage = resolveDisplayImageUrl(card.coverImage);

  return (
    <Link href={`/catalog/${card.id}`} className="cat-merchant-card">
      <div className="cat-merchant-cover">
        {coverImage ? (
          <CatalogImage src={card.coverImage} alt="" />
        ) : (
          <span className="cat-merchant-initials">{initials(card.name)}</span>
        )}
        {card.vipMenu ? (
          <span className="badge badge-gold cat-merchant-vip">VIP</span>
        ) : null}
      </div>

      <div className="cat-merchant-body">
        <div className="cat-merchant-head">
          <div className="merchant-identity">
            <MerchantAvatar
              name={card.name}
              logoUrl={card.logoUrl}
              size="md"
            />
            <strong>{card.name}</strong>
          </div>
          <span className={`badge ${meta.tone}`}>{meta.label}</span>
        </div>
        <span className="cat-merchant-meta">
          {card.cityName} · {card.vendorType}
        </span>

        <div className="cat-merchant-stats">
          <span>
            <strong>{card.productCount}</strong> منتج
          </span>
          <span>
            <strong>{card.publishedCount}</strong> منشور
          </span>
          <span>
            <strong>{card.pendingCount}</strong> للمراجعة
          </span>
        </div>

        <span
          className={`cat-merchant-flag${card.live ? " is-live" : ""}`}
        >
          {card.appPublished
            ? "منشور على التطبيق"
            : card.live
              ? "الكتالوج جاهز، غير منشور على التطبيق"
              : "بانتظار أول منتج"}
        </span>
      </div>
    </Link>
  );
}
