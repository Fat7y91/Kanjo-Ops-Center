import { z } from "zod";

import type { CapitalDeposit } from "./capital";
import type { PayoutMethodRecord } from "./types";

/**
 * Wire contract for `GET /api/admin/finance/reviews`.
 *
 * The review board decides money movement, so the payload is typed against the
 * same domain records the decision endpoints read. The receipt map carries
 * short-lived signed URLs; it travels with the rows because a deposit without
 * its receipt cannot be reviewed.
 *
 * `TreasuryAccount` lives in the `server-only` repository module, so the
 * minimal approval-target shape is redeclared here rather than imported.
 */
export type ReviewAccount = {
  id: string;
  bankName: string;
  currency: "EGP" | "SAR";
};

export type CapitalReviewPayload = {
  deposits: CapitalDeposit[];
  payouts: PayoutMethodRecord[];
  accounts: ReviewAccount[];
  receiptUrls: Record<string, string>;
};

export const capitalReviewPayloadSchema = z.custom<CapitalReviewPayload>(
  (value) => {
    if (typeof value !== "object" || value === null) return false;
    const payload = value as Record<string, unknown>;
    return (
      Array.isArray(payload.deposits) &&
      Array.isArray(payload.payouts) &&
      Array.isArray(payload.accounts) &&
      typeof payload.receiptUrls === "object" &&
      payload.receiptUrls !== null
    );
  },
  { message: "Treasury review payload does not match the expected shape." },
);
