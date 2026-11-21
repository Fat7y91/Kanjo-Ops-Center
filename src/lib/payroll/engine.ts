import {
  PAYROLL_ITEM_META,
  type PayrollItem,
  type PayrollItemType,
  type PayrollProfile,
} from "./types";

export type PayrollLine = {
  type: PayrollItemType;
  label: string;
  amount: number;
  signed: boolean;
  note: string;
};

export type PayrollResult = {
  items: PayrollLine[];
  gross: number;
  deductions: number;
  net: number;
};

/**
 * Tiered contracting commission.
 *
 * Tiers are cumulative bands, not a flat rate lookup: contribution up to the
 * first threshold earns tier-1 rate, the slice above it earns tier-2 rate, and
 * so on. Tiers are sorted ascending so a mis-ordered profile cannot produce a
 * negative band.
 */
export function tieredCommission(
  contribution: number,
  tiers: readonly { threshold: number; rate: number }[],
): number {
  if (contribution <= 0 || tiers.length === 0) return 0;
  const sorted = [...tiers].sort((left, right) => left.threshold - right.threshold);
  let total = 0;
  let lower = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const tier = sorted[index];
    const upper = tier.threshold;
    const band = Math.max(0, Math.min(contribution, upper) - lower);
    total += band * tier.rate;
    lower = upper;
    if (contribution <= upper) return total;
  }

  const top = sorted[sorted.length - 1];
  const overflow = contribution - lower;
  return total + overflow * top.rate;
}

/**
 * Builds the monthly payslip.
 *
 * Every line is derived from the profile, so the same inputs always produce the
 * same net. Incentives apply only to the commission + data-entry base, never to
 * the fixed salary, which keeps the multiplier an actual performance lever.
 */
export function computePayroll(
  profile: PayrollProfile,
  contribution: number,
): PayrollResult {
  const commission = tieredCommission(contribution, profile.commissionTiers);
  const dataEntry = profile.dataEntryCount * profile.dataEntryRate;
  const incentive =
    (commission + dataEntry) * Math.max(0, profile.incentiveMultiplier - 1);

  const items: PayrollLine[] = [
    line("base_salary", profile.baseSalary),
    line("transport", profile.transportAllowance),
    line("commission", commission, `${contribution} محقق`),
    line("data_entry", dataEntry, `${profile.dataEntryCount} سجل`),
    line("incentive", incentive, `×${profile.incentiveMultiplier.toFixed(2)}`),
  ];

  return finalize(items);
}

function line(
  type: PayrollItemType,
  amount: number,
  note = "",
): PayrollLine {
  const meta = PAYROLL_ITEM_META[type];
  return {
    type,
    label: meta.label,
    amount: Math.round(amount * 100) / 100,
    signed: meta.signed,
    note,
  };
}

/** Applies deduction lines (if any) and totals the slip. */
export function finalize(
  items: PayrollLine[],
  deductions: PayrollItem[] = [],
): PayrollResult {
  const deductionLines = deductions.map((item) => ({
    ...line("deduction", item.amount, item.note),
  }));
  const all = [...items, ...deductionLines];

  const gross = all
    .filter((entry) => entry.signed)
    .reduce((total, entry) => total + entry.amount, 0);
  const deducted = all
    .filter((entry) => !entry.signed)
    .reduce((total, entry) => total + entry.amount, 0);

  return {
    items: all,
    gross: Math.round(gross * 100) / 100,
    deductions: Math.round(deducted * 100) / 100,
    net: Math.round((gross - deducted) * 100) / 100,
  };
}
