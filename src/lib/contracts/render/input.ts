import type { ClauseRenderInput } from "./clauses";
import type { ContractClauseTemplate } from "./data/clauses";
import { normalizeBrandSpelling } from "./format";

/** A single editable party-panel row (label + value). */
export type PartyRowInput = { label: string; value: string };

/**
 * Renderer input for a contract document.
 *
 * Kept free of Node imports so it can be shared by the resolver (server data
 * path) and the pure-JS PDF engine (edge runtime).
 *
 * The optional `*Override` fields carry operator-edited terms. When absent the
 * document renders from canonical copy, so a contract with no stored terms is
 * byte-identical to the pre-editor output.
 */
export type ContractDocumentInput = ClauseRenderInput & {
  merchantId: string;
  merchantName: string;
  businessType: string;
  titleBusinessType?: string;
  /** Contract reference shown on the cover badge. */
  reference: string;
  /** Contract effective date (ISO), formatted on the cover. */
  effectiveDate?: string;
  displayRate: number;
  baseCommission: number | null;
  exceptions: { category: string; rate: number }[];
  vipPreContract?: boolean;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  /** Merchant legal identity bound into the second-party panel. */
  legalName?: string;
  commercialRegisterNo?: string;
  taxCardNo?: string;
  legalRepresentativeName?: string;
  legalRepresentativeTitle?: string;
  legalRepresentativeNationalId?: string;
  legalAddress?: string;
  merchantLogo?: string;
  /** Full clause list overriding the canonical generator, when provided. */
  clauses?: ContractClauseTemplate[];
  /** Narrative overrides; each replaces its canonical copy when present. */
  preamble?: string;
  copiesNote?: string;
  firstPartyRows?: PartyRowInput[];
  secondPartyRows?: PartyRowInput[];
  summaryNote?: string;
};

function normalizeOptional(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeBrandSpelling(value);
}

function normalizeRows(rows: PartyRowInput[] | undefined): PartyRowInput[] | undefined {
  return rows?.map((row) => ({
    label: normalizeBrandSpelling(row.label),
    value: normalizeBrandSpelling(row.value),
  }));
}

function normalizeClauses(
  clauses: ContractClauseTemplate[] | undefined,
): ContractClauseTemplate[] | undefined {
  return clauses?.map((clause) => ({
    title: normalizeBrandSpelling(clause.title),
    body: normalizeBrandSpelling(clause.body),
  }));
}

/**
 * Applies the canonical brand spelling to every user-visible text field.
 *
 * Called at the render boundary (both the PDF engine and the in-app preview),
 * so operator-authored clauses and legacy rows always print `كانچو` even when
 * their stored copy still uses the informal `كانجو` form.
 */
export function normalizeContractDocumentInput(
  input: ContractDocumentInput,
): ContractDocumentInput {
  return {
    ...input,
    merchantName: normalizeBrandSpelling(input.merchantName),
    businessType: normalizeBrandSpelling(input.businessType),
    titleBusinessType: normalizeOptional(input.titleBusinessType),
    reference: normalizeBrandSpelling(input.reference),
    contactName: normalizeOptional(input.contactName),
    contactPhone: normalizeOptional(input.contactPhone),
    address: normalizeOptional(input.address),
    legalName: normalizeOptional(input.legalName),
    commercialRegisterNo: normalizeOptional(input.commercialRegisterNo),
    taxCardNo: normalizeOptional(input.taxCardNo),
    legalRepresentativeName: normalizeOptional(input.legalRepresentativeName),
    legalRepresentativeTitle: normalizeOptional(input.legalRepresentativeTitle),
    legalRepresentativeNationalId: normalizeOptional(
      input.legalRepresentativeNationalId,
    ),
    legalAddress: normalizeOptional(input.legalAddress),
    clauses: normalizeClauses(input.clauses),
    preamble: normalizeOptional(input.preamble),
    copiesNote: normalizeOptional(input.copiesNote),
    firstPartyRows: normalizeRows(input.firstPartyRows),
    secondPartyRows: normalizeRows(input.secondPartyRows),
    summaryNote: normalizeOptional(input.summaryNote),
    exceptions: (input.exceptions ?? []).map((exception) => ({
      category: normalizeBrandSpelling(exception.category),
      rate: exception.rate,
    })),
    financialSpecialException: normalizeBrandSpelling(input.financialSpecialException),
    jurisdictionClause: normalizeBrandSpelling(input.jurisdictionClause),
  };
}
