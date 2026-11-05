import { z } from "zod";

/**
 * Domain vocabulary for the append-only audit trail (`app.audit_logs`).
 *
 * This is the V2 home of the V1 "Black Box": one immutable row per governed
 * change, carrying who acted, what they touched, and the before/after payload.
 * The table itself refuses every UPDATE (SQL trigger `audit_logs_immutable`), so
 * a correction is always a new entry, never a rewrite of history.
 */

export const AUDIT_LOG_COLUMNS = [
  "id",
  "occurred_at",
  "actor_id",
  "actor_name",
  "actor_role",
  "action_type",
  "target_entity",
  "target_id",
  "target_name",
  "entity_kind",
  "description",
  "collection",
  "source",
  "previous_data",
  "new_data",
  "changes",
  "created_at",
] as const;

export type AuditLog = {
  id: string;
  occurredAt: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  actionType: string;
  targetEntity: string;
  targetId: string;
  targetName: string;
  entityKind: string;
  description: string;
  collection: string;
  source: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  changes: Record<string, unknown> | null;
  createdAt: string;
};

/** A payload the application may append. `id` and timestamps are DB-owned. */
export const auditLogInputSchema = z.object({
  actorId: z.string().uuid().nullable().optional(),
  actorName: z.string().trim().max(120).default(""),
  actorRole: z.string().trim().max(80).default(""),
  actionType: z.string().trim().min(1, "نوع الإجراء مطلوب.").max(80),
  targetEntity: z.string().trim().max(80).default(""),
  targetId: z.string().trim().max(120).default(""),
  targetName: z.string().trim().max(200).default(""),
  entityKind: z.string().trim().max(80).default(""),
  description: z.string().trim().max(2000).default(""),
  collection: z.string().trim().max(120).default(""),
  source: z.string().trim().max(40).default("app"),
  previousData: z.record(z.string(), z.unknown()).nullable().optional(),
  newData: z.record(z.string(), z.unknown()).nullable().optional(),
  changes: z.record(z.string(), z.unknown()).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
});

export type AuditLogInput = z.infer<typeof auditLogInputSchema>;

/** Filters accepted by the read API and the audit screen. */
export const auditLogQuerySchema = z.object({
  collection: z.string().trim().max(120).optional(),
  targetId: z.string().trim().max(120).optional(),
  actorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
