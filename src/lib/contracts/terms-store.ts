import type { ContractTerms } from "./draft-editor";
import { ContractRepositoryError } from "./errors";
import { findContractRow } from "./repository";
import { findContractTerms, saveContractTerms } from "./terms-repository";
import { buildClauses } from "./render/clauses";
import { resolveLegalContext } from "./render/legal-context";
import { resolveContractDocumentInput } from "./render/resolve";
import type { Contract } from "./types";

/**
 * Tier 3 rules for contract terms editing.
 *
 * The capability gate lives in the API route; this module enforces the state
 * rule: terms of an open contract (draft / pending_signature) are editable by
 * any operator holding an editing capability, while a *finalised* contract
 * (signed / cancelled) requires the dedicated `edit_finalized_contracts`
 * capability — a plain editor may not silently reword an executed deal.
 *
 * Terms persistence never rewrites the contract row, so the SQL
 * `contracts_terminal_guard` stays intact and continues to protect the register.
 */

export type TermsEditOptions = {
  /** True when the actor holds `edit_finalized_contracts`. */
  canForceEdit: boolean;
};

/** Returns the contract, refusing when the actor may not edit its terms. */
export async function loadEditableContract(
  id: string,
  options: TermsEditOptions,
): Promise<Contract> {
  const contract = await findContractRow(id);
  if (!contract) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }
  if (isFinalised(contract) && !options.canForceEdit) {
    throw new ContractRepositoryError(
      "CONTRACT_TERMINAL",
      "هذا العقد منتهٍ. يلزمك إذن تحرير العقود المنتهية لتعديله.",
      409,
    );
  }
  return contract;
}

export function isFinalised(contract: Contract): boolean {
  return contract.status === "signed" || contract.status === "cancelled";
}

/**
 * Loads the terms the editor should show. When the contract has no stored
 * terms, it derives the canonical clauses/commission the PDF would render, so
 * opening and saving an untouched contract never erases the legal body.
 */
export async function getEditableTerms(
  contract: Contract,
): Promise<ContractTerms> {
  const stored = await findContractTerms(contract.id);
  if (stored) return stored;

  const input = await resolveContractDocumentInput(contract);
  const { financialSpecialException, jurisdictionClause } = resolveLegalContext(input);
  const clauses = buildClauses({
    category: input.category,
    achievedPercent: input.displayRate,
    financialSpecialException,
    jurisdictionClause,
  });

  return {
    baseCommission: input.displayRate,
    preamble: null,
    copiesNote: null,
    firstPartyRows: null,
    secondPartyRows: null,
    summaryNote: null,
    clauses: clauses.map((clause) => ({
      title: clause.title,
      body: clause.body,
      enabled: true,
    })),
    commissionLines: input.exceptions.map((line) => ({
      category: line.category,
      rate: line.rate,
    })),
  };
}

/** Persists a contract's terms after the state/permission check. */
export async function updateContractTerms(
  id: string,
  terms: ContractTerms,
  options: TermsEditOptions,
): Promise<ContractTerms> {
  await loadEditableContract(id, options);
  await saveContractTerms(id, terms);
  return terms;
}
