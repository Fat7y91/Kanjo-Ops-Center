import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import { embedName } from "./rows";
import type {
  ClearingLedgerRow,
  ClearingParty,
  ClearingStatus,
} from "./types";

/**
 * Tier 4 repository for `app.financial_ledgers` (the clearinghouse).
 *
 * Split from `repository.ts` so each table group stays under the file-size
 * limit. The routing trigger owns creation; this module reads the book and
 * records the settle decision.
 */

type LedgerRow = {
  id: string;
  operation_id: string;
  entity_type: ClearingLedgerRow["entityType"];
  merchant_id: string | null;
  courier_id: string | null;
  amount_minor: number;
  currency: ClearingLedgerRow["currency"];
  status: ClearingStatus;
  receipt_url: string | null;
  cleared_at: string | null;
  created_at: string;
  merchants: { name: string } | { name: string }[] | null;
  couriers: { display_name: string } | { display_name: string }[] | null;
  operation_logs: { order_id: string } | { order_id: string }[] | null;
};

const LEDGER_COLUMNS =
  "id,operation_id,entity_type,merchant_id,courier_id,amount_minor,currency,status,receipt_url,cleared_at,created_at,merchants(name),couriers(display_name),operation_logs(order_id)";

const LEDGER_COLUMNS_NO_JOIN =
  "id,operation_id,entity_type,merchant_id,courier_id,amount_minor,currency,status,receipt_url,cleared_at,created_at";

/* ── Mapper ─────────────────────────────────────────────────────────────── */

function toLedger(row: LedgerRow): ClearingLedgerRow {
  const entityType = row.entity_type;
  const partyId = entityType === "merchant" ? row.merchant_id : row.courier_id;
  const partyName =
    entityType === "merchant"
      ? embedName(row.merchants, "تاجر")
      : embedName(row.couriers, "مندوب");

  return {
    id: row.id,
    operationId: row.operation_id,
    orderId: embedName(row.operation_logs, "—"),
    entityType,
    partyId: partyId ?? "",
    partyName,
    amount: Number(row.amount_minor) / 100,
    currency: row.currency,
    status: row.status,
    receiptUrl: row.receipt_url,
    clearedAt: row.cleared_at,
    createdAt: row.created_at,
  };
}

/* ── Clearinghouse ──────────────────────────────────────────────────────── */

async function selectLedgers(
  columns: string,
  status?: ClearingStatus,
): Promise<{ data: unknown; error: unknown }> {
  const client = getSupabaseServerClient();
  const base = client
    .schema("app")
    .from("financial_ledgers")
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(500);

  const { data, error } = status ? await base.eq("status", status) : await base;
  return { data, error };
}

export async function listClearingLedgers(
  status?: ClearingStatus,
): Promise<ClearingLedgerRow[]> {
  const primary = await selectLedgers(LEDGER_COLUMNS, status);
  if (!primary.error) {
    return ((primary.data ?? []) as unknown as LedgerRow[]).map(toLedger);
  }
  if (!isMissingSchemaObject(primary.error)) throw primary.error;

  const fallback = await selectLedgers(LEDGER_COLUMNS_NO_JOIN, status);
  if (fallback.error && isMissingSchemaObject(fallback.error)) return [];
  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as unknown as LedgerRow[]).map(toLedger);
}

/**
 * Aggregates the per-party book.
 *
 * The database stores one row per order, so the balance is summed here rather
 * than by a view: the dataset is small (pending items only) and a view would
 * add another schema object whose absence would need degrading.
 */
export function summarizeParties(
  rows: readonly ClearingLedgerRow[],
): ClearingParty[] {
  const buckets = new Map<string, ClearingParty>();

  for (const row of rows) {
    if (row.status !== "pending") continue;
    const key = `${row.entityType}:${row.partyId}`;
    const current = buckets.get(key);
    if (current) {
      current.balance += row.amount;
      current.pendingCount += 1;
      continue;
    }
    buckets.set(key, {
      entityType: row.entityType,
      partyId: row.partyId,
      partyName: row.partyName,
      currency: row.currency,
      balance: row.amount,
      pendingCount: 1,
    });
  }

  return [...buckets.values()].sort(
    (a, b) => Math.abs(b.balance) - Math.abs(a.balance),
  );
}

export async function settleLedger(
  id: string,
  clearedBy: string,
  receiptUrl: string | null,
): Promise<ClearingLedgerRow> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("financial_ledgers")
    .update({
      status: "cleared",
      cleared_by: clearedBy,
      cleared_at: new Date().toISOString(),
      ...(receiptUrl ? { receipt_url: receiptUrl } : {}),
    })
    .eq("id", id)
    .select(LEDGER_COLUMNS_NO_JOIN)
    .single();

  if (error) throw error;
  return toLedger(data as unknown as LedgerRow);
}
