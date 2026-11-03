import type { CatalogProduct } from "@/lib/catalog/types";
import type { ContractState } from "@/lib/field-ops/types";

/**
 * Merchant-first catalog aggregation.
 *
 * The catalog screen lists merchants, not rows: a manager picks the merchant
 * first and only then looks at its products, which is how the field team
 * actually walks the network. Everything here is pure so the page stays a thin
 * server component and the numbers are unit-testable.
 */

export type CatalogMerchantSource = {
  id: string;
  name: string;
  cityName: string;
  vendorType: string;
  contractState: ContractState;
  /** Manager-controlled VIP flag from the merchant's V1 working fields. */
  vipMenu: boolean;
  /** Merchant is published on the customer app. */
  appPublished: boolean;
};

export type CatalogMerchantCard = CatalogMerchantSource & {
  productCount: number;
  publishedCount: number;
  pendingCount: number;
  /** First product image, shown as the tile cover. */
  coverImage: string | null;
  /** True once at least one product is live on the app. */
  live: boolean;
};

type MerchantTally = {
  productCount: number;
  publishedCount: number;
  pendingCount: number;
  coverImage: string | null;
};

export function buildMerchantCards(
  merchants: readonly CatalogMerchantSource[],
  products: readonly CatalogProduct[],
): CatalogMerchantCard[] {
  const tallies = new Map<string, MerchantTally>();
  for (const product of products) {
    const tally = tallies.get(product.merchantId) ?? {
      productCount: 0,
      publishedCount: 0,
      pendingCount: 0,
      coverImage: null,
    };
    tally.productCount += 1;
    if (product.state === "published") tally.publishedCount += 1;
    if (product.state === "pending_review") tally.pendingCount += 1;
    if (!tally.coverImage && product.imageDataUrl) {
      tally.coverImage = product.imageDataUrl;
    }
    tallies.set(product.merchantId, tally);
  }

  return merchants
    .map((merchant) => {
      const tally = tallies.get(merchant.id);
      return {
        ...merchant,
        productCount: tally?.productCount ?? 0,
        publishedCount: tally?.publishedCount ?? 0,
        pendingCount: tally?.pendingCount ?? 0,
        coverImage: tally?.coverImage ?? null,
        live: (tally?.publishedCount ?? 0) > 0,
      };
    })
    .sort((left, right) => {
      if (left.vipMenu !== right.vipMenu) return left.vipMenu ? -1 : 1;
      if (left.live !== right.live) return left.live ? -1 : 1;
      return left.name.localeCompare(right.name, "ar");
    });
}

export type EntryLeaderboardRow = {
  rank: number;
  repId: string | null;
  name: string;
  count: number;
  publishedCount: number;
  /** Share of the attributed entries, rounded to a whole percentage. */
  share: number;
};

export type EntryLeaderboard = {
  rows: EntryLeaderboardRow[];
  /** Entries with a known author — the ranking's denominator. */
  attributed: number;
  /** Legacy rows created before authorship was recorded. */
  unattributed: number;
};

type RepTally = { repId: string | null; name: string; count: number; publishedCount: number };

/**
 * Product-entry leaderboard per rep.
 *
 * Ties break on name so the order is stable between renders, and rows without
 * an author are reported separately instead of inventing a "unknown" rep.
 */
export function buildEntryLeaderboard(
  products: readonly CatalogProduct[],
  limit = 5,
): EntryLeaderboard {
  const tallies = new Map<string, RepTally>();
  let attributed = 0;
  let unattributed = 0;

  for (const product of products) {
    const name = product.enteredByName?.trim();
    if (!name) {
      unattributed += 1;
      continue;
    }
    attributed += 1;
    const key = product.enteredById ?? name;
    const tally = tallies.get(key) ?? {
      repId: product.enteredById,
      name,
      count: 0,
      publishedCount: 0,
    };
    tally.count += 1;
    if (product.state === "published") tally.publishedCount += 1;
    tallies.set(key, tally);
  }

  const rows = Array.from(tallies.values())
    .sort((left, right) =>
      right.count === left.count
        ? left.name.localeCompare(right.name, "ar")
        : right.count - left.count,
    )
    .slice(0, limit)
    .map((tally, index) => ({
      ...tally,
      rank: index + 1,
      share:
        attributed > 0 ? Math.round((tally.count / attributed) * 100) : 0,
    }));

  return { rows, attributed, unattributed };
}
