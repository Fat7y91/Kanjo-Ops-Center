import { listCities, listMerchants, listVisitReports } from "@/lib/field-ops/store";
import { listVendorTypes } from "@/lib/taxonomy/store";
import { listProducts } from "@/lib/catalog/store";
import type { Merchant } from "@/lib/field-ops/types";

import { buildFounderFinancials } from "@/lib/accounts/founder";
import { listBankAccounts, listLedgerEntries } from "@/lib/accounts/store";
import { summarizeAll } from "@/lib/accounts/ledger";
import { buildPayslips } from "@/lib/payroll/store";

import { buildMockExpenses, buildMockMarketing } from "./mock";
import { sum } from "./select";
import {
  biDatasetSchema,
  type BiCatalogRow,
  type BiDataset,
  type BiDealStage,
  type BiMerchantRow,
} from "./types";

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
  negotiated: Map<string, number>,
): number {
  if (merchant.agreedCommission != null) return merchant.agreedCommission;
  return negotiated.get(merchant.id) ?? 0;
}

/**
 * Aggregates the live field-ops and catalog stores into a single typed BI
 * payload, then layers deterministic mock finance/marketing facts on top.
 */
export async function buildBiDataset(): Promise<BiDataset> {
  const cities = listCities();
  const cityName = new Map(cities.map((city) => [city.id, city.name]));
  const merchants = listMerchants();
  const reports = listVisitReports();
  const products = listProducts();

  const publishedByMerchant = new Set(
    products
      .filter((product) => product.state === "published")
      .map((product) => product.merchantId),
  );

  const visitedByMerchant = new Map<string, string>();
  const negotiatedByMerchant = new Map<string, number>();
  const negotiatedAt = new Map<string, string>();
  const repByMerchant = new Map<string, { id: string; name: string }>();
  const repVisitAt = new Map<string, string>();
  for (const report of reports) {
    const previous = visitedByMerchant.get(report.merchantId);
    if (!previous || report.createdAt > previous) {
      visitedByMerchant.set(report.merchantId, report.createdAt);
    }
    const latestRep = repVisitAt.get(report.merchantId);
    if (!latestRep || report.createdAt > latestRep) {
      repVisitAt.set(report.merchantId, report.createdAt);
      repByMerchant.set(report.merchantId, {
        id: report.repId,
        name: report.repName,
      });
    }
    if (report.agreedCommission != null) {
      const newest = negotiatedAt.get(report.merchantId);
      if (!newest || report.createdAt > newest) {
        negotiatedAt.set(report.merchantId, report.createdAt);
        negotiatedByMerchant.set(report.merchantId, report.agreedCommission);
      }
    }
  }

  const merchantRows: BiMerchantRow[] = merchants.map((merchant) => {
    const visitedAt =
      visitedByMerchant.get(merchant.id) ?? merchant.lastVisitAt ?? null;
    return {
      id: merchant.id,
      name: merchant.name,
      cityId: merchant.cityId,
      cityName: cityName.get(merchant.cityId) ?? merchant.cityId,
      team: merchant.team ?? "غير مسند",
      repId: repByMerchant.get(merchant.id)?.id ?? null,
      repName: repByMerchant.get(merchant.id)?.name ?? null,
      vendorTypeId: merchant.vendorTypeId ?? null,
      vendorType: merchant.vendorType,
      stage: stageFor(merchant),
      monthlyValue: merchant.monthlyValue,
      targetCommission: merchant.targetCommission,
      achievedCommission: achievedCommission(merchant, negotiatedByMerchant),
      collected: merchant.contractState === "signed_contract" ? merchant.commissionAmount : 0,
      documents: documentsFor(
        merchant,
        publishedByMerchant.has(merchant.id),
      ),
      visitedAt,
      lastVisitAt: merchant.lastVisitAt,
    };
  });

  const catalogRows: BiCatalogRow[] = [
    ...products.map<BiCatalogRow>((product) => {
      const merchant = merchants.find(
        (candidate) => candidate.id === product.merchantId,
      );
      return {
        id: product.id,
        name: product.name,
        merchantId: product.merchantId,
        merchantName: product.merchantName,
        cityId: merchant?.cityId ?? "unknown",
        cityName: cityName.get(merchant?.cityId ?? "") ?? "غير محدد",
        team: merchant?.team ?? "غير مسند",
        // BI distinguishes published from still-unpublished; review states fold
        // into "missing" so the dashboard keeps one binary catalog-health
        // signal.
        state: product.state === "published" ? "published" : "missing",
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
        price: 0,
        updatedAt: merchant.updatedAt,
      })),
  ];

  // Mock finance/marketing spend is sized against each city's monthly GMV so
  // the numbers stay proportionate to the real merchant book.
  const scopes = cities.map((city) => ({
    cityId: city.id,
    cityName: city.name,
    team: city.opsManagers.length > 0 ? "City Operations" : "Executive",
    monthlyValue: sum(
      merchants
        .filter((merchant) => merchant.cityId === city.id)
        .map((merchant) => merchant.monthlyValue),
    ),
  }));

  const repOptions = Array.from(
    new Map(
      Array.from(repByMerchant.values()).map((rep) => [rep.id, rep]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name));

  const financials = buildFounderFinancials();
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

  const bankAccounts = listBankAccounts();
  const ledgerEntries = listLedgerEntries();
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
      label: entry.label,
      amount: entry.amount,
      currency: entry.currency,
      occurredAt: entry.occurredAt,
    }));
  const payslips = buildPayslips().map((slip) => ({
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
    expenses: buildMockExpenses(scopes),
    marketing: buildMockMarketing(scopes),
    catalog: catalogRows,
    treasury,
    accounts,
    ledger,
    payslips,
  });
}
