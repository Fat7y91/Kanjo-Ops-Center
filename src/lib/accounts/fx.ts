import { z } from "zod";

/**
 * Manual finance FX transfer input.
 *
 * Both amounts are entered by a finance admin from the actual bank documents:
 * the SAR deducted from Riyadh Bank and the EGP received in the Egyptian bank.
 * There is no rate field and no live lookup — the operator's two figures are
 * the fact the journal records. A receipt number requires a stored file, the
 * same rule the settlement endpoint enforces, so a receipt can never be a
 * dangling reference.
 */

export const FX_TRANSFER_INPUT = z
  .object({
    sarAmount: z.number().positive("أدخل مبلغ الريال المسحوب."),
    egpAmount: z.number().positive("أدخل مبلغ الجنيه المستلم."),
    label: z.string().trim().max(120).optional(),
    occurredAt: z.string().min(1),
    receiptNo: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((value) => (value ? value : null)),
    storagePath: z
      .string()
      .trim()
      .max(2048)
      .optional()
      .transform((value) => (value ? value : null)),
    mimeType: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => (value ? value : null)),
    sizeBytes: z.coerce.number().int().min(0).optional().nullable(),
  })
  .refine((value) => (value.receiptNo ? Boolean(value.storagePath) : true), {
    message: "أرفق ملف الإيصال عند إدخال رقم الإيصال.",
    path: ["storagePath"],
  });

export type FxTransferInput = z.infer<typeof FX_TRANSFER_INPUT>;

/** The implied rate, for display only. Never posted to the journal. */
export function impliedRate(sarAmount: number, egpAmount: number): number | null {
  if (!Number.isFinite(sarAmount) || sarAmount <= 0) return null;
  if (!Number.isFinite(egpAmount) || egpAmount <= 0) return null;
  return Math.round((egpAmount / sarAmount) * 10_000) / 10_000;
}
