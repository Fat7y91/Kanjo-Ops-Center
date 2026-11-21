import { z } from "zod";

export const PAYROLL_ITEM_TYPES = [
  "base_salary",
  "transport",
  "commission",
  "data_entry",
  "incentive",
  "deduction",
] as const;
export type PayrollItemType = (typeof PAYROLL_ITEM_TYPES)[number];

export const PAYROLL_ITEM_META: Record<
  PayrollItemType,
  { label: string; signed: boolean }
> = {
  base_salary: { label: "الراتب الأساسي", signed: true },
  transport: { label: "بدل الانتقال", signed: true },
  commission: { label: "عمولة التعاقدات", signed: true },
  data_entry: { label: "أجر إدخال البيانات", signed: true },
  incentive: { label: "حافز الأداء", signed: true },
  deduction: { label: "خصم", signed: false },
};

export const payrollItemSchema = z.object({
  type: z.enum(PAYROLL_ITEM_TYPES),
  amount: z.number().nonnegative(),
  note: z.string().default(""),
});
export type PayrollItem = z.infer<typeof payrollItemSchema>;

export const payrollProfileSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  title: z.string(),
  baseSalary: z.number().nonnegative(),
  transportAllowance: z.number().nonnegative(),
  /** Tiered contracting commission, highest tier ≤ contribution. */
  commissionTiers: z.array(
    z.object({ threshold: z.number().nonnegative(), rate: z.number() }),
  ),
  /** Flat per-record rate for data-entry work. */
  dataEntryRate: z.number().nonnegative(),
  dataEntryCount: z.number().nonnegative(),
  /** Multiplier applied to incentive-eligible totals. */
  incentiveMultiplier: z.number().nonnegative(),
  currency: z.enum(["EGP", "SAR"]),
});
export type PayrollProfile = z.infer<typeof payrollProfileSchema>;
