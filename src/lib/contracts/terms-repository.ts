import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { ContractTerms } from "./draft-editor";
import { ContractRepositoryError } from "./errors";
import { contractWriteError } from "./write-errors";
import {
  toContractTerms,
  toOverrideRows,
  type ClauseRow,
  type CommissionLineRow,
  type SectionOverrideRow,
} from "./terms-row";
import { isContractsDatabaseConfigured } from "./repository";

/**
 * Read and write the structured terms of one contract.
 *
 * Writes are replace-all and transactional in intent: clauses and commission
 * lines are cleared then re-inserted in order, and section overrides are upserted
 * per key. The contract row itself is never touched, so a finalised contract can
 * have its draft corrected without tripping `contracts_terminal_guard`. The
 * *policy* of who may edit a finalised contract lives in the store, not here.
 */

function storeUnavailable(): never {
  throw new ContractRepositoryError(
    "STORE_UNAVAILABLE",
    "سجل العقود غير مُفعّل على هذا النشر بعد.",
    503,
  );
}

/** Loads the stored terms, or empty terms when none/infrastructure absent. */
export async function findContractTerms(
  contractId: string,
): Promise<ContractTerms | null> {
  if (!isContractsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const [clauses, lines, overrides] = await Promise.all([
    client
      .schema("app")
      .from("contract_clauses")
      .select("id,contract_id,ordinal,title_ar,body_ar,active")
      .eq("contract_id", contractId)
      .order("ordinal", { ascending: true }),
    client
      .schema("app")
      .from("contract_commission_lines")
      .select("id,contract_id,category_name,commission_rate")
      .eq("contract_id", contractId)
      .order("category_name", { ascending: true }),
    client
      .schema("app")
      .from("contract_section_overrides")
      .select("section_key,content")
      .eq("contract_id", contractId),
  ]);

  const error = clauses.error ?? lines.error ?? overrides.error;
  if (error) {
    // A deployment missing the v2/force-edit migrations simply has no stored
    // terms yet; the resolver falls back to the canonical generator.
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }

  return toContractTerms(
    (clauses.data ?? []) as ClauseRow[],
    (lines.data ?? []) as CommissionLineRow[],
    (overrides.data ?? []) as SectionOverrideRow[],
  );
}

/** Replaces all clauses, commission lines, and section overrides for a contract. */
export async function saveContractTerms(
  contractId: string,
  terms: ContractTerms,
): Promise<void> {
  if (!isContractsDatabaseConfigured()) storeUnavailable();

  const client = getSupabaseServerClient();

  const clauseDelete = await client
    .schema("app")
    .from("contract_clauses")
    .delete()
    .eq("contract_id", contractId)
    .eq("scope", "contract");
  if (clauseDelete.error) contractWriteError(clauseDelete.error);

  const lineDelete = await client
    .schema("app")
    .from("contract_commission_lines")
    .delete()
    .eq("contract_id", contractId);
  if (lineDelete.error) contractWriteError(lineDelete.error);

  if (terms.clauses.length > 0) {
    const { error } = await client.schema("app").from("contract_clauses").insert(
      terms.clauses.map((clause, ordinal) => ({
        contract_id: contractId,
        scope: "contract",
        ordinal,
        title_ar: clause.title,
        body_ar: clause.body,
        active: clause.enabled,
      })),
    );
    if (error) contractWriteError(error);
  }

  if (terms.commissionLines.length > 0) {
    const { error } = await client
      .schema("app")
      .from("contract_commission_lines")
      .insert(
        terms.commissionLines.map((line) => ({
          contract_id: contractId,
          category_name: line.category,
          commission_rate: line.rate,
        })),
      );
    if (error) contractWriteError(error);
  }

  const overrideRows = toOverrideRows(contractId, terms);
  const overrideDelete = await client
    .schema("app")
    .from("contract_section_overrides")
    .delete()
    .eq("contract_id", contractId);
  if (overrideDelete.error) contractWriteError(overrideDelete.error);

  if (overrideRows.length > 0) {
    const { error } = await client
      .schema("app")
      .from("contract_section_overrides")
      .insert(overrideRows);
    if (error) contractWriteError(error);
  }
}
