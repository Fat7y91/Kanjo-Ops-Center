import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

const READ_TIMEOUT_MS = 6_000;
const FACT_BATCH_SIZE = 100;

export type OperationStatementFact = {
  orderNumber: string;
  occurredAt: string;
  orderValueMinor: number;
  commissionPercent: number | null;
  /** Assigned courier, joined to the roster for a human-readable name. */
  courierId: string | null;
  /** Courier name snapshotted on the operation row, when the schema has one. */
  courierName: string | null;
};

type OperationFactRow = {
  id: string;
  order_id: string;
  occurred_at: string;
  order_value_minor: number | string;
  commission_percent: number | string | null;
  courier_id?: string | null;
};

type StatementLineRow = {
  id: string;
  entry_id: string;
  debit_minor: number | string;
  credit_minor: number | string;
  memo: string | null;
  journal_entries:
    | {
        entry_date: string;
        memo: string | null;
        source_type: string;
        source_id: string | null;
        created_at: string;
      }
    | {
        entry_date: string;
        memo: string | null;
        source_type: string;
        source_id: string | null;
        created_at: string;
      }[]
    | null;
};

type PartyAccountRow = {
  id: string;
  party_type: "merchant" | "courier" | null;
  party_id: string | null;
  currency: "EGP" | "SAR";
  balance_minor: number | string;
};

/**
 * Tier 4 reads for a party's statement of account.
 *
 * Kept apart from the operations repository so the statement's join-heavy read
 * lives next to the shape it renders, and so the operations file stays within
 * its size budget.
 */

/**
 * The journal lines of one party account, oldest first.
 *
 * A statement needs the date and a human reference on every line, so each line
 * joins its entry for `entry_date`, `memo`, `source_type` and `source_id`. The
 * reference prefers the entry memo (which already names the order or the
 * settlement) and falls back to the raw source id, so a line is never blank.
 */
export async function listPartyStatementRows(accountId: string): Promise<
  {
    id: string;
    entryId: string;
    date: string;
    reference: string;
    memo: string;
    debitMinor: number;
    creditMinor: number;
    sourceType: string;
    sourceId: string | null;
  }[]
> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_lines")
    .select(
      "id,entry_id,debit_minor,credit_minor,memo,journal_entries(entry_date,memo,source_type,source_id,created_at)",
    )
    .eq("account_id", accountId)
    .limit(2000)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }

  const entryOf = (row: StatementLineRow) =>
    Array.isArray(row.journal_entries)
      ? (row.journal_entries[0] ?? null)
      : row.journal_entries;

  return ((data ?? []) as unknown as StatementLineRow[])
    .map((row) => {
      const entry = entryOf(row);
      const date = entry?.entry_date ?? entry?.created_at ?? "";
      const reference =
        entry?.memo?.trim() ||
        row.memo?.trim() ||
        entry?.source_id ||
        entry?.source_type ||
        "قيد";
      return {
        id: row.id,
        entryId: row.entry_id,
        date,
        reference,
        memo: row.memo ?? "",
        debitMinor: Number(row.debit_minor),
        creditMinor: Number(row.credit_minor),
        sourceType: entry?.source_type ?? "",
        sourceId: entry?.source_id ?? null,
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Order facts for statement lines whose source is an operation.
 *
 * The journal stores the operation id only, so the statement resolves the
 * human-facing order number, exact timestamp, subtotal and commission rate in
 * one batched read. Missing rows are simply absent from the map; the statement
 * then falls back to the journal memo.
 */
export async function listOperationStatementFacts(
  operationIds: string[],
): Promise<Map<string, OperationStatementFact>> {
  const unique = [...new Set(operationIds.filter(Boolean))];
  const facts = new Map<string, OperationStatementFact>();
  if (unique.length === 0) return facts;

  const client = getSupabaseServerClient();
  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += FACT_BATCH_SIZE) {
    batches.push(unique.slice(index, index + FACT_BATCH_SIZE));
  }

  const fetchBatch = (batch: string[], withCourier: boolean) =>
    client
      .schema("app")
      .from("operation_logs")
      .select(
        withCourier
          ? "id,order_id,occurred_at,order_value_minor,commission_percent,courier_id"
          : "id,order_id,occurred_at,order_value_minor,commission_percent",
      )
      .in("id", batch)
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  // A deployment whose code runs ahead of the courier column migration must
  // still render order numbers and values; only the courier name is optional.
  const results = await Promise.all(
    batches.map(async (batch) => {
      const primary = await fetchBatch(batch, true);
      if (primary.error && isMissingSchemaObject(primary.error)) {
        return fetchBatch(batch, false);
      }
      return primary;
    }),
  );

  for (const { data, error } of results) {
    if (error) {
      if (isMissingSchemaObject(error)) continue;
      throw error;
    }
    for (const row of (data ?? []) as unknown as OperationFactRow[]) {
      const percent = Number(row.commission_percent);
      facts.set(row.id, {
        orderNumber: row.order_id,
        occurredAt: row.occurred_at,
        orderValueMinor: Number(row.order_value_minor),
        commissionPercent: row.commission_percent === null ? null : percent,
        courierId: row.courier_id ?? null,
        courierName: null,
      });
    }
  }

  return facts;
}

/**
 * One party account row from the balance view, for a statement header.
 *
 * Returns null when the id is not a party account (a control account or an
 * unknown id), so a statement request can answer 404 instead of pricing a
 * control account as if it belonged to a merchant.
 */
export async function findPartyAccount(
  accountId: string,
): Promise<{
  accountId: string;
  partyType: "merchant" | "courier";
  partyId: string;
  currency: "EGP" | "SAR";
  balance: number;
} | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_account_balances")
    .select("id,party_type,party_id,currency,balance_minor")
    .eq("id", accountId)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  if (!data) return null;

  const row = data as unknown as PartyAccountRow;
  if (!row.party_type || !row.party_id) return null;

  return {
    accountId: row.id,
    partyType: row.party_type,
    partyId: row.party_id,
    currency: row.currency,
    balance: Number(row.balance_minor) / 100,
  };
}
