import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isQueryTimeout,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { GovernanceError, fromDatabaseError } from "@/lib/governance/errors";

import {
  AUDIT_LOG_COLUMNS,
  type AuditLog,
  type AuditLogQuery,
} from "./types";

/**
 * Tier 4 repository for `app.audit_logs`.
 *
 * Created by `20261112000000_legacy_gap_resolutions.sql`. The table is
 * append-only (a BEFORE UPDATE trigger raises `AUDIT_LOG_IMMUTABLE`), so this
 * module exposes a read and a single insert. There is deliberately no update or
 * delete: a correction is a new row.
 *
 * Reads degrade to `null` when the migration is not deployed yet, which is a
 * deployment-ordering problem rather than an empty log. The screen then shows
 * its "not enabled on this deployment" state instead of a misleading empty
 * table.
 */

const READ_TIMEOUT_MS = 6_000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

type AuditLogRow = {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  action_type: string;
  target_entity: string;
  target_id: string;
  target_name: string;
  entity_kind: string;
  description: string;
  collection: string;
  source: string;
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changes: Record<string, unknown> | null;
  created_at: string;
};

export function isAuditDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function toAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    actionType: row.action_type,
    targetEntity: row.target_entity,
    targetId: row.target_id,
    targetName: row.target_name,
    entityKind: row.entity_kind,
    description: row.description,
    collection: row.collection,
    source: row.source,
    previousData: row.previous_data ?? null,
    newData: row.new_data ?? null,
    changes: row.changes ?? null,
    createdAt: row.created_at,
  };
}

/**
 * The newest entries first, narrowed by any supplied filter.
 *
 * `null` means the database is not configured or the table is not deployed
 * yet. Every other failure throws so the page offers a retry instead of an
 * empty feed.
 */
export async function listAuditLogs(
  query: Partial<AuditLogQuery> = {},
): Promise<AuditLog[] | null> {
  if (!isAuditDatabaseConfigured()) return null;

  const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const client = getSupabaseServerClient();
  let statement = client
    .schema("app")
    .from("audit_logs")
    .select(AUDIT_LOG_COLUMNS.join(","))
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (query.collection) statement = statement.eq("collection", query.collection);
  if (query.targetId) statement = statement.eq("target_id", query.targetId);
  if (query.actorId) statement = statement.eq("actor_id", query.actorId);

  const { data, error } = await statement.abortSignal(
    AbortSignal.timeout(READ_TIMEOUT_MS),
  );

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    if (isQueryTimeout(error)) {
      throw new Error(
        "AUDIT_LOG_TIMEOUT: the audit read exceeded its deadline",
      );
    }
    throw error;
  }

  return ((data ?? []) as unknown as AuditLogRow[]).map(toAuditLog);
}

/** Inserts one entry. The database stamps the id and timestamps. */
export async function insertAuditLog(row: {
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
  occurredAt?: string;
}): Promise<AuditLog> {
  const client = getSupabaseServerClient();
  const insert: Record<string, unknown> = {
    actor_id: row.actorId,
    actor_name: row.actorName,
    actor_role: row.actorRole,
    action_type: row.actionType,
    target_entity: row.targetEntity,
    target_id: row.targetId,
    target_name: row.targetName,
    entity_kind: row.entityKind,
    description: row.description,
    collection: row.collection,
    source: row.source,
    previous_data: row.previousData,
    new_data: row.newData,
    changes: row.changes,
  };
  if (row.occurredAt) insert.occurred_at = row.occurredAt;

  const { data, error } = await client
    .schema("app")
    .from("audit_logs")
    .insert(insert)
    .select(AUDIT_LOG_COLUMNS.join(","))
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) {
      throw new GovernanceError(
        "STORE_UNAVAILABLE",
        "سجل التدقيق غير مُفعّل على هذا النشر بعد.",
        503,
      );
    }
    const mapped = fromDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
  return toAuditLog(data as unknown as AuditLogRow);
}

/** Distinct collections currently present, for the filter bar. */
export async function listAuditCollections(): Promise<string[]> {
  if (!isAuditDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("audit_logs")
    .select("collection")
    .not("collection", "eq", "")
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .limit(2000);

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    return [];
  }

  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{ collection: string }>) {
    if (row.collection) seen.add(row.collection);
  }
  return [...seen].sort((left, right) => left.localeCompare(right, "ar"));
}
