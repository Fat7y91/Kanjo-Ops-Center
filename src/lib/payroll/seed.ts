import type { PayrollProfile } from "./types";

/**
 * Default payroll tiers for contracting commission.
 *
 * The bands reward volume progressively: the first 50k at 1%, the next 50k at
 * 1.5%, and anything above 100k at 2%. Applied cumulatively by
 * `tieredCommission()` in `engine.ts`.
 */
export const DEFAULT_COMMISSION_TIERS = [
  { threshold: 50_000, rate: 0.01 },
  { threshold: 100_000, rate: 0.015 },
  { threshold: Number.POSITIVE_INFINITY, rate: 0.02 },
] as const;

function profile(
  userId: string,
  userName: string,
  title: string,
  overrides: Partial<PayrollProfile> = {},
): PayrollProfile {
  return {
    userId,
    userName,
    title,
    baseSalary: 8_000,
    transportAllowance: 1_200,
    commissionTiers: [...DEFAULT_COMMISSION_TIERS],
    dataEntryRate: 15,
    dataEntryCount: 0,
    incentiveMultiplier: 1,
    currency: "EGP",
    ...overrides,
  };
}

/** Seed payroll profiles keyed to the RBAC roster. */
export function seedPayrollProfiles(): PayrollProfile[] {
  return [
    profile("u-rep-fox", "Hassan Mostafa", "مندوب ميداني", {
      baseSalary: 7_500,
      dataEntryCount: 120,
    }),
    profile("u-rep-power", "Dina Samir", "مندوب ميداني", {
      baseSalary: 7_800,
      dataEntryCount: 86,
      incentiveMultiplier: 1.25,
    }),
    profile("u-rep-cairo-3", "Yara Adel", "مندوب ميداني", {
      baseSalary: 7_200,
      dataEntryCount: 142,
      incentiveMultiplier: 1.1,
    }),
    profile("u-rep-cairo-4", "Mahmoud Fekry", "مندوب ميداني", {
      baseSalary: 7_400,
      dataEntryCount: 64,
    }),
    profile("u-rep-giza", "Karim Nabil", "مندوب ميداني", {
      baseSalary: 7_600,
      dataEntryCount: 98,
      incentiveMultiplier: 1.15,
    }),
    profile("u-rep-mansoura", "Aya Fathy", "مندوب ميداني", {
      baseSalary: 7_300,
      dataEntryCount: 51,
    }),
    profile("u-sales", "Omar Khaled", "شراكات التجار", {
      baseSalary: 11_000,
      transportAllowance: 1_800,
      dataEntryCount: 0,
      incentiveMultiplier: 1.5,
      currency: "EGP",
    }),
  ];
}
