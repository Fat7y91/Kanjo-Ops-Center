import { z } from "zod";

import {
  parsePayoutPreferences,
  payoutPreferencesSchema,
  type PayoutPreferences,
} from "./payout";

/**
 * Delivery-partner (courier) domain types.
 *
 * A courier is a back-office roster record: a name, a contact number, a fixed
 * profit per delivered order, and how they get paid. There is no login and no
 * password — couriers never sign in to the platform. Earnings and balances are
 * derived from the operations ledger, never stored on the roster row.
 */

export const COURIER_STATUSES = ["active", "inactive"] as const;
export type CourierStatus = (typeof COURIER_STATUSES)[number];

export const COURIER_STATUS_LABEL: Record<CourierStatus, string> = {
  active: "نشط",
  inactive: "موقوف",
};

export type Courier = {
  id: string;
  displayName: string;
  phone: string;
  /** Fixed profit kept per delivered order (major units). */
  fixedProfitPerOrder: number;
  payoutPreferences: PayoutPreferences | null;
  active: boolean;
  appliedAt: string;
  /** Total fixed profit earned across logged operations (major units). */
  earnings: number;
  /** Number of logged deliveries assigned to this courier. */
  deliveries: number;
  /** Pending clearinghouse balance owed to the courier (major units). */
  balance: number;
  /** Gross delivery value handled in the current calendar month (major units). */
  monthlyDeliveryAmount: number;
  /** Fixed profit earned in the current calendar month (major units). */
  monthlyProfit: number;
};

/** Identity portion shared by create and update. */
const identityShape = {
  fullName: z.string().trim().min(2, "اسم مندوب التوصيل مطلوب.").max(80),
  phone: z
    .string()
    .trim()
    .regex(
      /^\+?[0-9][0-9\s-]{6,18}$/,
      "أدخل رقم هاتف صالحاً، مثل 01012345678 أو +201012345678.",
    ),
  fixedProfit: z.coerce
    .number()
    .min(0, "الربح الثابت لا يكون سالباً.")
    .default(0),
  payout: payoutPreferencesSchema,
  active: z.boolean().default(true),
};

export const courierCreateSchema = z.object(identityShape);
export const courierUpdateSchema = z.object(identityShape);

export type CourierCreateInput = z.infer<typeof courierCreateSchema>;
export type CourierUpdateInput = z.infer<typeof courierUpdateSchema>;

/** Exposed so the repository can normalise raw JSONB in the same place. */
export { parsePayoutPreferences };
