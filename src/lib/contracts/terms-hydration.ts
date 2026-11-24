import { KANJO_FIRST_PARTY } from "./render/constants";
import { BRANCH_SCOPE_SUFFIX } from "./render/data/clauses";
import {
  DEFAULT_CONTRACT_COPIES_NOTE,
  DEFAULT_CONTRACT_PREAMBLE,
  EMPTY_CONTRACT_TERMS,
  type ContractTerms,
  type DraftPartyRow,
} from "./draft-editor";

/**
 * Draft-terms hydration.
 *
 * A contract opened in the editor must never show blank legal sections: the
 * clauses, commission structure, preamble, copies note and both party panels
 * all have canonical values. This module fills those canonical values for any
 * field the operator has not set yet.
 *
 * The distinction between `null` and an empty value is deliberate:
 *   - `null` / missing      → never set, so hydrate the canonical value
 *   - `""` / `[]` (explicit) → the operator cleared it, so keep it cleared
 *
 * A whole terms object that is entirely empty (the legacy symptom: clauses `[]`
 * and every override `null`) is treated as never set and fully hydrated.
 */

export type ContractMerchantIdentity = {
  name: string;
  businessType?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  legalName?: string | null;
  commercialRegisterNo?: string | null;
  taxCardNo?: string | null;
  legalRepresentativeName?: string | null;
  legalRepresentativeTitle?: string | null;
  legalRepresentativeNationalId?: string | null;
  legalAddress?: string | null;
};

export type TermsHydrationInput = {
  merchant: ContractMerchantIdentity;
  baseCommission: number;
  exceptions: { category: string; rate: number }[];
  clauses: { title: string; body: string }[];
};

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** True when every part of the terms payload is empty / never set. */
export function contractTermsAreUnset(terms: ContractTerms): boolean {
  const hasClauses = terms.clauses.some(
    (clause) => text(clause.title) || text(clause.body),
  );
  return (
    !hasClauses &&
    terms.clauses.length === 0 &&
    terms.commissionLines.length === 0 &&
    terms.baseCommission === null &&
    !text(terms.preamble) &&
    !text(terms.copiesNote) &&
    !text(terms.summaryNote) &&
    !(terms.firstPartyRows?.length) &&
    !(terms.secondPartyRows?.length)
  );
}

/** First-party identification rows derived from the fixed Kanjo registration. */
export function defaultFirstPartyRows(): DraftPartyRow[] {
  return [
    {
      id: "fp-cr",
      label: "السجل التجاري",
      value: `${KANJO_FIRST_PARTY.commercialRegister} — ${KANJO_FIRST_PARTY.commercialRegisterOffice}`,
    },
    {
      id: "fp-tax",
      label: "البطاقة الضريبية",
      value: `${KANJO_FIRST_PARTY.taxCard} — ${KANJO_FIRST_PARTY.taxOffice}`,
    },
    { id: "fp-address", label: "المقر", value: KANJO_FIRST_PARTY.address },
    {
      id: "fp-rep",
      label: "يمثلها",
      value: "م/ محمود الجمل — مدير التشغيل والتعاقدات",
    },
  ];
}

/** Second-party identification rows bound to the merchant legal identity. */
export function defaultSecondPartyRows(
  merchant: ContractMerchantIdentity,
): DraftPartyRow[] {
  return [
    {
      id: "sp-name",
      label: "اسم المنشأة / المحل",
      value: text(merchant.legalName)
        ? `${text(merchant.legalName)}${BRANCH_SCOPE_SUFFIX}`
        : text(merchant.name),
    },
    {
      id: "sp-representative",
      label: "اسم المفوض / صاحب النشاط",
      value:
        text(merchant.legalRepresentativeName) ||
        text(merchant.contactName) ||
        "",
    },
    {
      id: "sp-representative-title",
      label: "صفة المفوض",
      value: text(merchant.legalRepresentativeTitle),
    },
    {
      id: "sp-national-id",
      label: "الرقم القومي للمنشأة",
      value: text(merchant.legalRepresentativeNationalId),
    },
    {
      id: "sp-cr",
      label: "رقم السجل التجاري",
      value: text(merchant.commercialRegisterNo),
    },
    {
      id: "sp-tax",
      label: "رقم التسجيل الضريبي",
      value: text(merchant.taxCardNo),
    },
    {
      id: "sp-phone",
      label: "رقم الهاتف / واتساب",
      value: text(merchant.contactPhone),
    },
    {
      id: "sp-address",
      label: "العنوان",
      value: text(merchant.legalAddress) || text(merchant.address),
    },
  ];
}

/**
 * Returns terms safe to show in the editor: stored overrides win, missing
 * narrative/party sections fall back to canonical copy, and a wholly empty
 * payload is replaced by the full default template.
 */
export function hydrateContractTerms(
  stored: ContractTerms | null,
  input: TermsHydrationInput,
): ContractTerms {
  const unset = !stored || contractTermsAreUnset(stored);
  const base = stored ?? EMPTY_CONTRACT_TERMS;

  return {
    baseCommission: base.baseCommission ?? input.baseCommission,
    preamble:
      base.preamble == null ? DEFAULT_CONTRACT_PREAMBLE : base.preamble,
    copiesNote:
      base.copiesNote == null
        ? DEFAULT_CONTRACT_COPIES_NOTE
        : base.copiesNote,
    firstPartyRows:
      base.firstPartyRows == null
        ? defaultFirstPartyRows()
        : base.firstPartyRows,
    secondPartyRows:
      base.secondPartyRows == null
        ? defaultSecondPartyRows(input.merchant)
        : base.secondPartyRows,
    summaryNote: base.summaryNote ?? "",
    clauses: unset
      ? input.clauses.map((clause) => ({
          title: clause.title,
          body: clause.body,
          enabled: true,
        }))
      : base.clauses,
    commissionLines: unset
      ? input.exceptions
          .filter((line) => text(line.category))
          .map((line) => ({ category: line.category, rate: line.rate }))
      : base.commissionLines,
  };
}
