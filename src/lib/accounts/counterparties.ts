import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { resolvePartyNames } from "@/lib/operations/party-lookup";

/**
 * The other side of a bank movement.
 *
 * A statement line must say where the money came from or went to, and the
 * bank's own leg only says "in" or "out". The counterparty is read from the
 * opposite journal lines of the same entry: a merchant, a courier, a revenue
 * account or an expense account. Party sub-accounts are resolved to their
 * current roster name, so a renamed merchant shows the name the operator knows.
 */

/** Friendly labels for the control accounts that are not party sub-accounts. */
const CONTROL_LABELS: Record<string, string> = {
  "1000": "البنك المصري",
  "1000-SAR": "البنك السعودي",
  "1010": "النقدية",
  "1010-SAR": "النقدية (السعودية)",
  "1100": "مستحقات التجار",
  "1200": "مستحقات المناديب",
  "2000": "التزامات التجار",
  "2100": "التزامات المناديب",
  "2400": "محفظة العملاء",
  "3000": "رأس المال",
  "4000": "إيراد العمولة",
  "4100": "إيراد التوصيل",
  "5000": "مصروف الكوبونات",
  "5100": "مصروف أرباح المناديب",
  "5200": "مصروف الكاش باك",
  "5300": "مصروف استرداد المحفظة",
  "5400": "مصروفات تشغيلية",
  "9999": "حساب معلّق",
};

type CounterLineRow = {
  entry_id: string;
  accounts:
    | {
        code: string;
        name: string;
        party_type: "merchant" | "courier" | null;
        party_id: string | null;
      }
    | {
        code: string;
        name: string;
        party_type: "merchant" | "courier" | null;
        party_id: string | null;
      }[]
    | null;
};

function first<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Resolves a counterparty label per entry for the given bank account code.
 *
 * Lines that belong to the bank account itself are skipped, because the
 * counterparty is what sits on the other side of the entry. Multiple opposite
 * legs are joined, so a settlement that clears several accounts is still
 * readable.
 */
export async function loadCounterparties(
  entryIds: readonly string[],
  bankCode: string,
): Promise<Map<string, string>> {
  const unique = [...new Set(entryIds)];
  if (unique.length === 0) return new Map();

  let rows: CounterLineRow[];
  try {
    const client = getSupabaseServerClient();
    const { data, error } = await client
      .schema("app")
      .from("journal_lines")
      .select("entry_id,accounts(code,name,party_type,party_id)")
      .in("entry_id", unique)
      .limit(4000);

    if (error) {
      if (isMissingSchemaObject(error)) return new Map();
      throw error;
    }
    rows = (data ?? []) as unknown as CounterLineRow[];
  } catch (error) {
    if (isMissingSchemaObject(error)) return new Map();
    throw error;
  }

  const merchantIds: string[] = [];
  const courierIds: string[] = [];
  for (const row of rows) {
    const account = first(row.accounts);
    if (account?.party_type === "merchant" && account.party_id) {
      merchantIds.push(account.party_id);
    }
    if (account?.party_type === "courier" && account.party_id) {
      courierIds.push(account.party_id);
    }
  }

  const names = await resolvePartyNames({ merchantIds, courierIds });
  const byEntry = new Map<string, string[]>();

  for (const row of rows) {
    const account = first(row.accounts);
    if (!account || account.code === bankCode) continue;
    const label =
      (account.party_type === "merchant"
        ? names.merchants.get(account.party_id ?? "")
        : account.party_type === "courier"
          ? names.couriers.get(account.party_id ?? "")
          : undefined) ??
      CONTROL_LABELS[account.code] ??
      account.name;
    const existing = byEntry.get(row.entry_id) ?? [];
    if (!existing.includes(label)) existing.push(label);
    byEntry.set(row.entry_id, existing);
  }

  const result = new Map<string, string>();
  for (const [entryId, labels] of byEntry) {
    result.set(entryId, labels.join(" + "));
  }
  return result;
}
