import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import {
  RECEIPT_SUMMARY_COLUMNS,
  RIDER_COLUMNS,
  UUID_PATTERN,
  toReceiptSummary,
  toRider,
  type ReceiptSummaryRow,
  type RiderRow,
} from "./rows";
import type { Rider, RiderDetail, RiderReceiptSummary } from "./types";

export function isRidersDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

async function fetchReceiptSummaries(
  riderIds: readonly string[],
): Promise<Map<string, RiderReceiptSummary[]>> {
  const map = new Map<string, RiderReceiptSummary[]>();
  if (riderIds.length === 0) return map;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("rider_custody_receipts")
    .select(RECEIPT_SUMMARY_COLUMNS)
    .in("rider_id", riderIds)
    .order("delivery_date", { ascending: false });

  if (error) {
    if (isMissingSchemaObject(error)) return map;
    throw error;
  }

  for (const row of (data ?? []) as unknown as ReceiptSummaryRow[]) {
    const summary = toReceiptSummary(row);
    const list = map.get(row.rider_id) ?? [];
    list.push(summary);
    map.set(row.rider_id, list);
  }
  return map;
}

export async function listRiders(): Promise<Rider[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select(RIDER_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }

  const rows = (data ?? []) as unknown as RiderRow[];
  const receipts = await fetchReceiptSummaries(rows.map((row) => row.id));
  return rows.map((row) => toRider(row, receipts.get(row.id) ?? []));
}

export async function getRiderDetail(id: string): Promise<RiderDetail | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("couriers")
    .select(RIDER_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  if (!data) return null;

  const rider = data as unknown as RiderRow;
  const receiptsMap = await fetchReceiptSummaries([rider.id]);
  const receipts = receiptsMap.get(rider.id) ?? [];
  return { rider: toRider(rider, receipts), receipts };
}
