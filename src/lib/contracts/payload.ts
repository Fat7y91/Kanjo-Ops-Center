import { z } from "zod";

import { contractSchema } from "./types";

/**
 * Wire contract for `GET /api/contracts`.
 *
 * The register is validated at the boundary: a value that arrives as a string
 * would otherwise be formatted into a currency figure and read as real money.
 * Merchant and city lists travel with the rows because the draft form needs
 * them and they are scoped by the same session.
 */
export const contractsPayloadSchema = z.object({
  contracts: z.array(contractSchema),
  merchants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      cityId: z.string(),
    }),
  ),
  cities: z.array(z.object({ id: z.string(), name: z.string() })),
});

export type ContractsPayload = z.infer<typeof contractsPayloadSchema>;
