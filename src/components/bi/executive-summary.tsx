"use client";

import Link from "next/link";

import { count, money, percent } from "@/lib/bi/format";
import type { OrderMetricSummary } from "@/lib/bi/order-metrics";
import type {
  CatalogSummary,
  FinanceSummary,
  MarketingSummary,
} from "@/lib/bi/select";

type ExecutiveSummaryProps = {
  merchantCount: number;
  signedCount: number;
  orders: OrderMetricSummary;
  finance: FinanceSummary;
  marketing: MarketingSummary;
  catalog: CatalogSummary;
  showFinancials: boolean;
};

type Tile = {
  href: string;
  label: string;
  value: string;
  detail: string;
  tone: "purple" | "gold" | "green" | "red";
};

/**
 * Command-center strip.
 *
 * Six or five compact tiles answer the first question of the screen — is the
 * business healthy? — and each tile is the entry point to the module that owns
 * the number. This replaces the old scroll to a detail section for the headline
 * facts.
 */
export function ExecutiveSummary({
  merchantCount,
  signedCount,
  orders,
  finance,
  marketing,
  catalog,
  showFinancials,
}: ExecutiveSummaryProps) {
  const tiles: Tile[] = [
    {
      href: "/merchants",
      label: "التجار",
      value: count(merchantCount),
      detail: `${count(signedCount)} عقد موقّع`,
      tone: "purple",
    },
    {
      href: "/contracts",
      label: "التعاقدات المكتملة",
      value: count(signedCount),
      detail: "عقود موقّعة في النطاق",
      tone: "gold",
    },
  ];

  if (showFinancials) {
    tiles.push(
      {
        href: "/operations/log",
        label: "الطلبات",
        value: count(orders.orders),
        detail: `${money(orders.volume)} حجم`,
        tone: "green",
      },
      {
        href: "/finance/clearinghouse",
        label: "صافي التحصيل",
        value: money(finance.net),
        detail: `${money(finance.collected)} محصّل`,
        tone: "green",
      },
    );
  }

  tiles.push(
    {
      href: "/marketing",
      label: "تحويلات الحملات",
      value: count(marketing.conversions),
      detail: `${count(marketing.leads)} عميل محتمل`,
      tone: "gold",
    },
    {
      href: "/catalog",
      label: "جاهزية الكتالوج",
      value: percent(catalog.readiness),
      detail: `${count(catalog.published)} من ${count(catalog.total)} منشور`,
      tone: catalog.readiness >= 0.8 ? "green" : "red",
    },
  );

  return (
    <nav className="exec-summary" aria-label="ملخص مؤشرات المؤسسة">
      {tiles.map((tile) => (
        <Link
          key={tile.href}
          href={tile.href}
          className={`exec-tile exec-tile-${tile.tone}`}
        >
          <span className="exec-tile-label">{tile.label}</span>
          <strong className="exec-tile-value">{tile.value}</strong>
          <span className="exec-tile-detail">{tile.detail}</span>
          <span className="exec-tile-link" aria-hidden="true">
            عرض التفاصيل
          </span>
        </Link>
      ))}
    </nav>
  );
}
