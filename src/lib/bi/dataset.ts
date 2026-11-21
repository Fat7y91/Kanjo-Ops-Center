import { listCities, listMerchants } from "@/lib/field-ops/store";
import { listVendorTypes } from "@/lib/taxonomy/store";
import { listProducts } from "@/lib/catalog/store";
import { listMerchantV1Flags } from "@/lib/field-ops/merchant-profile-repository";
import type { Merchant } from "@/lib/field-ops/types";

import { buildFounderFinancials } from "@/lib/accounts/founder";
import { listBankAccounts, listLedgerEntries } from "@/lib/accounts/store";
import { summarizeAll } from "@/lib/accounts/ledger";
import { listCampaigns, listMarketingEntries } from "@/lib/marketing/store";
import { loadPartyBalanceTotals } from "@/lib/operations/clearinghouse-repository";
import { buildPayslips } from "@/lib/payroll/store";

import { buildLiveExpenses, buildLiveMarketing } from "./live-facts";
import { loadOrderMetrics } from "./order-metrics-server";
import { loadMerchantFacts } from "./merchant-facts";
import {
  biDatasetSchema,
  type BiCatalogRow,
  type BiDataset,
  type BiDealStage,
  type BiMerchantRow,
} from "./types";

/**
 * Shows the expense context the way an accountant reads it: the category first,
 * then the free-text detail the operator entered.
 */
function expenseStatementLabel(entry: {
  label: string;
  counterparty: string;
}): string {
  if (!entry.counterparty || entry.counterparty === entry.label) {
    return entry.label;
  }
  return `${entry.counterparty} (${entry.label})`;
}

/**
 * Maps a stored contract state onto the funnel bucket the dashboard shows.
 * `visited` is not a contract state: it is detected from the visit timestamp.
 */
function stageFor(merchant: Merchant): BiDealStage {
  switch (merchant.contractState) {
    case "signed_contract":
      return "signed";
    case "final_contract":
      return "final";
    case "provisional":
      return "provisional";
    default:
      return "no_contract";
  }
}

/**
 * Legal pack completion.
 *
 * `license` stands in for the commercial registry (CR), `tax` for the tax card,
 * and the menu is satisfied by any published catalog product. Contract PDFs are
 * deliberately excluded: they belong to the signing workflow, not the legal pack.
 */
function documentsFor(
  merchant: Merchant,
  hasPublishedProduct: boolean,
): BiMerchantRow["documents"] {
  const hasType = (type: string) =>
    merchant.documents.some((document) => document.type === type);
  return {
    cr: hasType("license"),
    tax: hasType("tax"),
    menu: hasPublishedProduct,
  };
}

/**
 * Negotiated commission actually on the table.
 *
 * The merchant record only locks `agreedCommission` at signature time, so for
 * provisional/final deals we read the latest visit report instead of assuming
 * the rep hit the target exactly. Unknown stays 0 so the gauge shows a real gap
 * rather than a flattering 100%.
 */
function achievedCommission(
  merchant: Merchant,
  fact: { negotiatedCommission: number | null } | undefined,
): number {
  if (merchant.agreedCommission != null) return merchant.agreedCommission;
  return fact?.negotiatedCommission ?? 0;
}

/**
 * A product counts as live when it passed QA (`completed`) or was explicitly
 * published. The migrated V1 catalog only ever stores `completed`, so keying
 * readiness on `published` alone reported a permanent zero.
 */
function isSellableProduct(state: string): boolean {
  return state === "published" || state === "completed";
}

/**
 * Aggregates the live field-ops and catalog tables into a single typed BI
 * payload. Finance and marketing facts come from `live-facts.ts`, which reads
 * the treasury and marketing tables — there is no synthetic dataset.
 *
 * Report-derived facts (last visit, latest negotiated commission) are read from
 * the pre-computed `app.bi_merchant_rollup` view when it is available; local
 * dev and CI use a single-pass fallback. Merchants and products are read from
 * their SQL tables, which are the single source of truth.
 */
export async function buildBiDataset(): Promise<BiDataset> {
  const cities = await listCities();
  const cityName = new Map(cities.map((city) => [city.id, city.name]));
  const merchants = await listMerchants();
  const products = await listProducts();
  const facts = await loadMerchantFacts();

  const publishedByMerchant = new Set(
    products
      .filter((product) => isSellableProduct(product.state))
      .map((product) => product.merchantId),
  );

  const merchantRows: BiMerchantRow[] = merchants.map((merchant) => {
    const fact = facts.get(merchant.id);
    const visitedAt = fact?.visitedAt ?? merchant.lastVisitAt ?? null;
    return {
      id: merchant.id,
      name: merchant.name,
      cityId: merchant.cityId,
      cityName: cityName.get(merchant.cityId) ?? merchant.cityId,
      team: merchant.team ?? "غير مسند",
      repId: fact?.repId ?? null,
      repName: fact?.repName ?? null,
      vendorTypeId: merchant.vendorTypeId ?? null,
      vendorType: merchant.vendorType,
      stage: stageFor(merchant),
      monthlyValue: merchant.monthlyValue,
      targetCommission: merchant.targetCommission,
      achievedCommission: achievedCommission(merchant, fact),
      collected: merchant.contractState === "signed_contract" ? merchant.commissionAmount : 0,
      documents: documentsFor(merchant, publishedByMerchant.has(merchant.id)),
      visitedAt,
      lastVisitAt: merchant.lastVisitAt,
    };
  });

  const merchantById = new Map(merchants.map((merchant) => [merchant.id, merchant]));
  const flags = await listMerchantV1Flags();
  const isAppPublished = (merchantId: string) =>
    flags.get(merchantId)?.appPublished ?? false;

  const catalogRows: BiCatalogRow[] = [
    ...products.map<BiCatalogRow>((product) => {
      const merchant = merchantById.get(product.merchantId);
      return {
        id: product.id,
        name: product.name,
        merchantId: product.merchantId,
        merchantName: product.merchantName,
        cityId: merchant?.cityId ?? "unknown",
        cityName: cityName.get(merchant?.cityId ?? "") ?? "غير محدد",
        team: merchant?.team ?? "غير مسند",
        // BI distinguishes sellable from still-unpublished; review states fold
        // into "missing" so the dashboard keeps one binary catalog-health
        // signal.
        state: isSellableProduct(product.state) ? "published" : "missing",
        appPublished: isAppPublished(product.merchantId),
        price: product.price,
        updatedAt: product.updatedAt,
      };
    }),
    ...merchants
      .filter((merchant) => !publishedByMerchant.has(merchant.id))
      .map<BiCatalogRow>((merchant) => ({
        id: `catalog-missing-${merchant.id}`,
        name: "لا توجد منتجات منشورة",
        merchantId: merchant.id,
        merchantName: merchant.name,
        cityId: merchant.cityId,
        cityName: cityName.get(merchant.cityId) ?? merchant.cityId,
        team: merchant.team ?? "غير مسند",
        state: "missing",
        appPublished: isAppPublished(merchant.id),
        price: 0,
        updatedAt: merchant.updatedAt,
      })),
  ];

  const repOptions = Array.from(
    new Map(
      Array.from(facts.values())
        .filter(
          (fact): fact is typeof fact & { repId: string; repName: string } =>
            fact.repId !== null && fact.repName !== null,
        )
        .map((fact) => [fact.repId, { id: fact.repId, name: fact.repName }]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name));

  // Built once and shared: the treasury obligation and the payroll widget must
  // read the same rollup, not two independent snapshots.
  const [payslips, orders] = await Promise.all([
    buildPayslips(),
    loadOrderMetrics(),
  ]);
  const financials = await buildFounderFinancials(payslips);
  const treasury = financials.accounts.map((snapshot) => ({
    currency: snapshot.currency,
    deposits: snapshot.deposits,
    expenses: snapshot.expenses,
    balance: snapshot.balance,
    pendingPayroll:
      financials.pending.find(
        (obligation) => obligation.currency === snapshot.currency,
      )?.amount ?? 0,
  }));

  const [
    bankAccounts,
    ledgerEntries,
    campaigns,
    marketingEntries,
    partyBalances,
  ] = await Promise.all([
    listBankAccounts(),
    listLedgerEntries(),
    listCampaigns(),
    listMarketingEntries(),
    loadPartyBalanceTotals(),
  ]);
  const resolveCity = (cityId: string | null) =>
    cityId ? (cityName.get(cityId) ?? cityId) : "غير محدد";
  const accounts = summarizeAll(bankAccounts, ledgerEntries).map(
    (summary) => ({
      id: summary.account.id,
      bankName: summary.account.bankName,
      iban: summary.account.iban,
      currency: summary.account.currency,
      deposits: summary.deposits,
      expenses: summary.expenses,
      balance: summary.balance,
    }),
  );
  const bankNames = new Map(
    bankAccounts.map((account) => [account.id, account.bankName]),
  );
  const ledger = ledgerEntries
    .filter((entry) => entry.kind === "expense")
    .map((entry) => ({
      id: entry.id,
      bankName: bankNames.get(entry.accountId) ?? "—",
      label: expenseStatementLabel(entry),
      amount: entry.amount,
      currency: entry.currency,
      occurredAt: entry.occurredAt,
    }));
  const payslipRows = payslips.map((slip) => ({
    userId: slip.profile.userId,
    userName: slip.profile.userName,
    title: slip.profile.title,
    gross: slip.result.gross,
    deductions: slip.result.deductions,
    net: slip.result.net,
  }));

  const vendorTypes = listVendorTypes()
    .filter((vendor) => vendor.active)
    .map((vendor) => ({ id: vendor.id, name: vendor.name_ar }));

  return biDatasetSchema.parse({
    generatedAt: new Date().toISOString(),
    cities: cities.map((city) => ({ id: city.id, name: city.name })),
    reps: repOptions,
    vendorTypes,
    teams: Array.from(
      new Set(
        merchantRows
          .map((row) => row.team)
          .concat("City Operations", "Executive"),
      ),
    ).sort((left, right) => left.localeCompare(right)),
    merchants: merchantRows,
    expenses: buildLiveExpenses(bankAccounts, ledgerEntries, resolveCity),
    marketing: buildLiveMarketing(campaigns, marketingEntries, resolveCity),
    catalog: catalogRows,
    orders,
    partyBalances,
    treasury,
    accounts,
    ledger,
    payslips: payslipRows,
  });
}
