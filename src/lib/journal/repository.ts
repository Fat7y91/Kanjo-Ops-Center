import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { resolvePartyNames } from "@/lib/operations/party-lookup";
import { signedTransactionReceiptUrl } from "@/lib/operations/receipt-storage";

import type {
  JournalEntryDetail,
  JournalLineDetail,
  JournalReceipt,
  JournalPartyType,
} from "./types";

/**
 * Tier 4 read for one journal entry, as a digital voucher.
 *
 * A ledger row only carries one leg. The voucher needs the whole entry: both
 * sides, the party behind each sub-account, the reason and any receipt. Three
 * reads are made (header, lines joined to accounts, receipt) plus a roster lookup
 * for party names, so a renamed merchant is shown by its current name rather
 * than the snapshot the account was created with.
 */

const READ_TIMEOUT_MS = 6_000;

type EntryRow = {
  id: string;
  entry_no: number | string;
  entry_date: string;
  created_at: string;
  memo: string | null;
  source_type: string;
  source_id: string | null;
  currency: "EGP" | "SAR";
};

type LineRow = {
  id: string;
  debit_minor: number | string;
  credit_minor: number | string;
  memo: string | null;
  accounts:
    | {
        code: string;
        name: string;
        party_type: JournalPartyType | null;
        party_id: string | null;
      }
    | {
        code: string;
        name: string;
        party_type: JournalPartyType | null;
        party_id: string | null;
      }[]
    | null;
};

type ReceiptRow = {
  receipt_no: string;
  mime_type: string;
  size_bytes: number | string;
  uploaded_at: string;
};

const ENTRY_COLUMNS =
  "id,entry_no,entry_date,created_at,memo,source_type,source_id,currency";
const LINE_COLUMNS =
  "id,debit_minor,credit_minor,memo,accounts(code,name,party_type,party_id)";
const RECEIPT_COLUMNS = "receipt_no,mime_type,size_bytes,uploaded_at";

function first<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const money = (minor: number) => Math.round(minor) / 100;

async function findEntryRow(entryId: string): Promise<EntryRow | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_entries")
    .select(ENTRY_COLUMNS)
    .eq("id", entryId)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return (data as unknown as EntryRow | null) ?? null;
}

async function listLineRows(entryId: string): Promise<LineRow[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("journal_lines")
    .select(LINE_COLUMNS)
    .eq("entry_id", entryId)
    .limit(200)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }
  return (data ?? []) as unknown as LineRow[];
}

async function findReceiptRow(
  entryId: string,
): Promise<(ReceiptRow & { storage_path: string }) | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("transaction_receipts")
    .select(`${RECEIPT_COLUMNS},storage_path`)
    .eq("entry_id", entryId)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return (
    (data as unknown as (ReceiptRow & { storage_path: string }) | null) ?? null
  );
}

function partyNameFor(
  line: LineRow,
  names: { merchants: Map<string, string>; couriers: Map<string, string> },
): { partyName: string | null; partyType: JournalPartyType | null } {
  const account = first(line.accounts);
  if (!account?.party_type || !account.party_id) {
    return { partyName: null, partyType: account?.party_type ?? null };
  }
  const roster =
    account.party_type === "merchant"
      ? names.merchants
      : account.party_type === "courier"
        ? names.couriers
        : null;
  return {
    partyType: account.party_type,
    partyName: roster?.get(account.party_id) ?? null,
  };
}

function toLine(
  row: LineRow,
  names: { merchants: Map<string, string>; couriers: Map<string, string> },
): JournalLineDetail {
  const account = first(row.accounts);
  const debit = Number(row.debit_minor);
  const credit = Number(row.credit_minor);
  const { partyName, partyType } = partyNameFor(row, names);

  return {
    id: row.id,
    code: account?.code ?? "",
    name: account?.name ?? "",
    side: debit > 0 ? "debit" : "credit",
    amount: money(debit > 0 ? debit : credit),
    memo: row.memo ?? "",
    partyType,
    partyName,
  };
}

/**
 * Loads the voucher for one entry.
 *
 * Returns null when the entry does not exist, so the API answers 404 instead of
 * rendering a blank voucher. The receipt's signed URL is added by the service,
 * which owns the storage concern; here it is left null.
 */
export async function loadJournalEntry(
  entryId: string,
): Promise<JournalEntryDetail | null> {
  const entry = await findEntryRow(entryId);
  if (!entry) return null;

  const [lineRows, receiptRow] = await Promise.all([
    listLineRows(entryId),
    findReceiptRow(entryId),
  ]);

  const names = await resolvePartyNames({
    merchantIds: lineRows
      .map((row) => first(row.accounts))
      .filter((account) => account?.party_type === "merchant")
      .map((account) => account?.party_id ?? ""),
    courierIds: lineRows
      .map((row) => first(row.accounts))
      .filter((account) => account?.party_type === "courier")
      .map((account) => account?.party_id ?? ""),
  });

  const lines = lineRows
    .map((row) => toLine(row, names))
    .sort((left, right) => {
      if (left.side !== right.side) return left.side === "debit" ? -1 : 1;
      return left.code.localeCompare(right.code);
    });

  const debitTotal = lines
    .filter((line) => line.side === "debit")
    .reduce((sum, line) => sum + line.amount, 0);
  const creditTotal = lines
    .filter((line) => line.side === "credit")
    .reduce((sum, line) => sum + line.amount, 0);

  const merchants = [
    ...new Set(
      lines
        .filter((line) => line.partyType === "merchant" && line.partyName)
        .map((line) => line.partyName as string),
    ),
  ];
  const couriers = [
    ...new Set(
      lines
        .filter((line) => line.partyType === "courier" && line.partyName)
        .map((line) => line.partyName as string),
    ),
  ];

  const receipt: JournalReceipt | null = receiptRow
    ? {
        receiptNo: receiptRow.receipt_no,
        mimeType: receiptRow.mime_type,
        sizeBytes: Number(receiptRow.size_bytes),
        uploadedAt: receiptRow.uploaded_at,
        url: await signedTransactionReceiptUrl(receiptRow.storage_path),
      }
    : null;

  return {
    entryId: entry.id,
    entryNo: String(entry.entry_no),
    entryDate: entry.entry_date,
    createdAt: entry.created_at,
    memo: entry.memo ?? "",
    sourceType: entry.source_type,
    sourceId: entry.source_id,
    currency: entry.currency,
    lines,
    debitTotal: Math.round(debitTotal * 100) / 100,
    creditTotal: Math.round(creditTotal * 100) / 100,
    parties: { merchants, couriers },
    receipt,
  };
}
