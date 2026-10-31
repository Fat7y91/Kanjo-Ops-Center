import type { BankAccount, LedgerEntry } from "./types";

/**
 * Deterministic seed for the accounts ledger.
 *
 * The Saudi account is seeded with the reference figures (SAR 48,650.00 in
 * deposits, SAR 39,736.31 in expenses, SAR 8,913.69 remaining) so the balance
 * formula can be asserted exactly. Entries are append-only; the seed is the
 * genesis block, not an editable snapshot.
 */
export function seedBankAccounts(): BankAccount[] {
  return [
    {
      id: "bank-sa-riyadh",
      bankName: "مصرف الراجحي",
      accountName: "كانجو للتجارة",
      accountNumber: "0012345678901",
      iban: "SA0380000000608010167519",
      country: "SA",
      currency: "SAR",
      cityId: null,
      active: true,
      createdAt: "2026-01-04T09:00:00.000Z",
    },
    {
      id: "bank-eg-cairo",
      bankName: "البنك الأهلي المصري",
      accountName: "كانجو للتجارة",
      accountNumber: "1002003004005",
      iban: "EG380019000500000000263180002",
      country: "EG",
      currency: "EGP",
      cityId: "city-cairo",
      active: true,
      createdAt: "2026-01-04T09:00:00.000Z",
    },
  ];
}

export function seedLedgerEntries(): LedgerEntry[] {
  const recorded = "2026-01-05T09:00:00.000Z";
  return [
    {
      id: "led-sa-dep-1",
      accountId: "bank-sa-riyadh",
      kind: "deposit",
      label: "دفعة تشغيل الرياض",
      amount: 30_000,
      currency: "SAR",
      occurredAt: "2026-02-01T08:00:00.000Z",
      recordedBy: "seed",
      recordedAt: recorded,
    },
    {
      id: "led-sa-dep-2",
      accountId: "bank-sa-riyadh",
      kind: "deposit",
      label: "دفعة تشغيل جدة",
      amount: 18_650,
      currency: "SAR",
      occurredAt: "2026-03-01T08:00:00.000Z",
      recordedBy: "seed",
      recordedAt: recorded,
    },
    {
      id: "led-sa-exp-1",
      accountId: "bank-sa-riyadh",
      kind: "expense",
      label: "رواتب فريق الميدان",
      amount: 14_500.25,
      currency: "SAR",
      occurredAt: "2026-02-28T14:00:00.000Z",
      recordedBy: "seed",
      recordedAt: recorded,
    },
    {
      id: "led-sa-exp-2",
      accountId: "bank-sa-riyadh",
      kind: "expense",
      label: "حملات تسويق",
      amount: 12_236.06,
      currency: "SAR",
      occurredAt: "2026-03-10T14:00:00.000Z",
      recordedBy: "seed",
      recordedAt: recorded,
    },
    {
      id: "led-sa-exp-3",
      accountId: "bank-sa-riyadh",
      kind: "expense",
      label: "بدل انتقال",
      amount: 8_000,
      currency: "SAR",
      occurredAt: "2026-03-18T14:00:00.000Z",
      recordedBy: "seed",
      recordedAt: recorded,
    },
    {
      id: "led-sa-exp-4",
      accountId: "bank-sa-riyadh",
      kind: "expense",
      label: "لوجستيات ومستودعات",
      amount: 5_000,
      currency: "SAR",
      occurredAt: "2026-03-25T14:00:00.000Z",
      recordedBy: "seed",
      recordedAt: recorded,
    },
    {
      id: "led-eg-dep-1",
      accountId: "bank-eg-cairo",
      kind: "deposit",
      label: "دفعة تشغيل القاهرة",
      amount: 120_000,
      currency: "EGP",
      occurredAt: "2026-02-02T08:00:00.000Z",
      recordedBy: "seed",
      recordedAt: recorded,
    },
    {
      id: "led-eg-exp-1",
      accountId: "bank-eg-cairo",
      kind: "expense",
      label: "رواتب فريق القاهرة",
      amount: 84_000,
      currency: "EGP",
      occurredAt: "2026-02-27T14:00:00.000Z",
      recordedBy: "seed",
      recordedAt: recorded,
    },
  ];
}
