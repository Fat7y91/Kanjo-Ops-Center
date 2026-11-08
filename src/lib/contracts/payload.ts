import { z } from "zod";

import { CONTRACT_STATES } from "@/lib/field-ops/types";

import { contractSchema } from "./types";

/**
 * Wire contract for `GET /api/contracts`.
 *
 * The register is validated at the boundary: a value that arrives as a string
 * would otherwise be formatted into a currency figure and read as real money.
 * Merchant and city lists travel with the rows because the draft form needs
 * them and they are scoped by the same session.
 *
 * `merchants` is already eligibility-filtered and carries the resolved
 * agreement state plus the VIP flag, so the form can explain why a merchant is
 * offerable. `cityId` is nullable for merchants that exist only in visit
 * history and were never attributed to a city.
 */
export const contractsPayloadSchema = z.object({
  contracts: z.array(contractSchema),
  merchants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      cityId: z.string().nullable(),
      state: z.enum(CONTRACT_STATES),
      vipMenu: z.boolean(),
    }),
  ),
  cities: z.array(z.object({ id: z.string(), name: z.string() })),
});

export type ContractsPayload = z.infer<typeof contractsPayloadSchema>;
