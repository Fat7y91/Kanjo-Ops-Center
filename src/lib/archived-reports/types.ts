import { z } from "zod";

/**
 * Archived visit reports (`app.archived_reports`).
 *
 * A report that leaves the live field-ops timeline is not destroyed: it moves
 * here with the reason and the operator who removed it. Restoring deletes only
 * this archive row; the canonical `app.visit_reports` row is untouched.
 */

export type ArchivedReport = {
  id: string;
  taskId: string | null;
  merchantId: string;
  taskName: string;
  report: Record<string, unknown>;
  archivedBy: string | null;
  archivedByName: string;
  reason: string;
  occurredAt: string;
  createdAt: string;
};

export const archivedReportInputSchema = z.object({
  taskId: z.string().trim().max(120).nullable().default(null),
  merchantId: z.string().trim().min(1, "معرّف التاجر مطلوب.").max(120),
  taskName: z.string().trim().max(200).default(""),
  report: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(3, "سبب الأرشفة مطلوب.").max(500),
  occurredAt: z.string().datetime().optional(),
});

export type ArchivedReportInput = z.infer<typeof archivedReportInputSchema>;
