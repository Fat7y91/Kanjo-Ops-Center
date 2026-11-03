import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isQueryTimeout,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { MerchantStateRollup } from "./merchant-state";
import type { ContractState, StateOverride } from "./types";

/**
 * Tier 4 repository for merchant state (`app` schema, Supabase).
 *
 * Two objects back this module, both created by
 * `20261103000000_merchant_state_rollup.sql`:
 *
 * - `app.merchant_state_rollup` — one pre-computed row per merchant: resolved
 *   agreement state, its timestamp and source, and the visit counters. Reading
 *   it is a single indexed scan instead of "download every visit report and
 *   reduce it in JavaScript", which is what pushed `/merchants` past the
 *   Cloudflare Worker CPU limit.
 * - `app.merchant_state_overrides` — the append-only record of a manager
 *   decision. Writing here is what makes a decision survive the isolate that
 *   served it.
 *
 * This is the only module that knows the column names.
 */

const ROLLUP_COLUMNS =
  "merchant_id,current_state,current_state_at,current_state_source,current_state_actor,visit_count,total_duration_seconds,last_visit_at,last_outcome,last_rep_name";

/**
 * Deadline for the rollup read. A hang is worse than a retry: the boundary
 * offers one, and the platform would otherwise kill the whole request.
 */
const READ_TIMEOUT_MS = 4_000;

/**
 * `in.(...)` is sent in the URL, so a directory-wide id list would overflow it.
 * Above this many ids the whole rollup is read instead — still one small row
 * per merchant.
 */
const MAX_FILTERED_IDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RollupRow = {
  merchant_id: string;
  current_state: ContractState | null;
  current_state_at: string | null;
  current_state_source: MerchantStateRollup["source"] | null;
  current_state_actor: string | null;
  visit_count: number | string | null;
  total_duration_seconds: number | string | null;
  last_visit_at: string | null;
  last_outcome: ContractState | null;
  last_rep_name: string | null;
};

/**
 * Normalises a Postgres timestamp to `toISOString()` form.
 *
 * State resolution compares timestamps as strings, so `+00:00` and `Z` spellings
 * of the same instant must not leak into the comparison.
 */
function iso(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function toRollup(row: RollupRow): MerchantStateRollup {
  return {
    merchantId: row.merchant_id,
    state: row.current_state,
    at: iso(row.current_state_at),
    source: row.current_state_source ?? "none",
    actor: row.current_state_actor,
    visitCount: Number(row.visit_count ?? 0),
    totalDurationSeconds: Number(row.total_duration_seconds ?? 0),
    lastVisitAt: iso(row.last_visit_at),
    lastOutcome: row.last_outcome,
    lastRepName: row.last_rep_name,
  };
}

export function isMerchantStateDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/**
 * The pre-computed state of every merchant the database knows about.
 *
 * Returns `null` when the database is not configured or the migration is not
 * deployed yet, which tells the caller to keep serving the in-memory catalogue
 * (demo deployments). A busy or failing database throws: silently substituting
 * seed data would show fabricated merchant state in production.
 */
export async function listMerchantStateRollups(
  merchantIds?: readonly string[],
): Promise<MerchantStateRollup[] | null> {
  if (!isMerchantStateDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  let query = client
    .schema("app")
    .from("merchant_state_rollup")
    .select(ROLLUP_COLUMNS)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (
    merchantIds &&
    merchantIds.length > 0 &&
    merchantIds.length <= MAX_FILTERED_IDS
  ) {
    query = query.in("merchant_id", [...merchantIds]);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaObject(error)) return null;
    if (isQueryTimeout(error)) {
      throw new Error(
        "MERCHANT_STATE_TIMEOUT: the state rollup read exceeded its deadline",
      );
    }
    throw error;
  }

  return ((data ?? []) as RollupRow[]).map(toRollup);
}

/**
 * Ids are uuid FKs in `app.users`; seeded actors (`u-rep-fox`) are not rows
 * there and must be recorded as an unattributed decision rather than rejected.
 */
function loggedByValue(actorId: string | null): string | null {
  return actorId && UUID.test(actorId) ? actorId : null;
}

/**
 * Records one manager state decision.
 *
 * `unavailable` means the migration is not deployed yet, so the in-memory store
 * remains the only copy. Every other error is thrown: a governance decision is
 * never silently dropped.
 */
export async function persistStateOverride(
  override: StateOverride,
  loggedBy: string | null,
): Promise<"stored" | "unavailable"> {
  if (!isMerchantStateDatabaseConfigured()) return "unavailable";

  const client = getSupabaseServerClient();
  const { error } = await client
    .schema("app")
    .from("merchant_state_overrides")
    .insert({
      id: UUID.test(override.id) ? override.id : crypto.randomUUID(),
      merchant_id: override.merchantId,
      merchant_name: override.merchantName,
      from_state: override.fromState,
      to_state: override.toState,
      actor_id: override.actorId,
      actor_name: override.actorName,
      note: override.note,
      created_at: override.createdAt,
      logged_by: loggedByValue(loggedBy),
    });

  if (!error) return "stored";
  if (isMissingSchemaObject(error)) return "unavailable";
  // A retried request carries its own id, so a replay is the same decision.
  if (isUniqueViolation(error)) return "stored";
  throw error;
}
