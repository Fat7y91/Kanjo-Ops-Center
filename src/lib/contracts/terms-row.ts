import type {
  ContractTerms,
  DraftPartyRow,
  StoredSectionContent,
} from "./draft-editor";

/**
 * Row shapes and mappings for the contract terms tables.
 *
 * Kept separate from the repository so the only place that knows column names
 * stays small and testable. Three tables back one `ContractTerms` value:
 * `contract_clauses`, `contract_commission_lines`, and
 * `contract_section_overrides` (see `20261117000000_contracts_v2.sql` and
 * `20261119000000_contract_force_edit.sql`).
 */

export type ClauseRow = {
  id: string;
  contract_id: string | null;
  ordinal: number;
  title_ar: string;
  body_ar: string;
  active: boolean;
};

export type CommissionLineRow = {
  id: string;
  contract_id: string;
  category_name: string;
  commission_rate: number | string;
};

export type SectionOverrideRow = {
  section_key: string;
  content: unknown;
};

export const SECTION_KEYS = {
  preamble: "preamble",
  copiesNote: "copies_note",
  firstParty: "first_party",
  secondParty: "second_party",
  summary: "summary",
  commissionBase: "commission_base",
} as const;

function asText(content: unknown): string | null {
  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text;
    return typeof text === "string" ? text : null;
  }
  return null;
}

function asRate(content: unknown): number | null {
  if (content && typeof content === "object" && "rate" in content) {
    const rate = Number((content as { rate?: unknown }).rate);
    return Number.isFinite(rate) ? rate : null;
  }
  return null;
}

function asRows(content: unknown): DraftPartyRow[] | null {
  if (!content || typeof content !== "object" || !("rows" in content)) return null;
  const rows = (content as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return null;
  return rows
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const record = row as { label?: unknown; value?: unknown };
      return {
        id: `row-${index}`,
        label: typeof record.label === "string" ? record.label : "",
        value: typeof record.value === "string" ? record.value : "",
      };
    })
    .filter((row): row is DraftPartyRow => row !== null);
}

/** Builds the full terms value from the three freshly-read tables. */
export function toContractTerms(
  clauses: ClauseRow[],
  lines: CommissionLineRow[],
  overrides: SectionOverrideRow[],
): ContractTerms {
  const byKey = new Map(overrides.map((row) => [row.section_key, row.content]));
  return {
    baseCommission: asRate(byKey.get(SECTION_KEYS.commissionBase)),
    preamble: asText(byKey.get(SECTION_KEYS.preamble)),
    copiesNote: asText(byKey.get(SECTION_KEYS.copiesNote)),
    firstPartyRows: asRows(byKey.get(SECTION_KEYS.firstParty)),
    secondPartyRows: asRows(byKey.get(SECTION_KEYS.secondParty)),
    summaryNote: asText(byKey.get(SECTION_KEYS.summary)),
    clauses: clauses.map((clause) => ({
      title: clause.title_ar,
      body: clause.body_ar,
      enabled: clause.active,
    })),
    commissionLines: lines.map((line) => ({
      category: line.category_name,
      rate: Number(line.commission_rate),
    })),
  };
}

/** Section-override rows for a terms value, skipping empty sections. */
export function toOverrideRows(
  contractId: string,
  terms: ContractTerms,
): { contract_id: string; section_key: string; content: StoredSectionContent }[] {
  const rows: {
    contract_id: string;
    section_key: string;
    content: StoredSectionContent;
  }[] = [];
  const push = (key: string, content: StoredSectionContent) =>
    rows.push({ contract_id: contractId, section_key: key, content });

  if (terms.baseCommission !== null) {
    push(SECTION_KEYS.commissionBase, { rate: terms.baseCommission });
  }
  if (terms.preamble) push(SECTION_KEYS.preamble, { text: terms.preamble });
  if (terms.copiesNote) push(SECTION_KEYS.copiesNote, { text: terms.copiesNote });
  if (terms.summaryNote) push(SECTION_KEYS.summary, { text: terms.summaryNote });
  if (terms.firstPartyRows && terms.firstPartyRows.length > 0) {
    push(SECTION_KEYS.firstParty, {
      rows: terms.firstPartyRows.map(({ label, value }) => ({ label, value })),
    });
  }
  if (terms.secondPartyRows && terms.secondPartyRows.length > 0) {
    push(SECTION_KEYS.secondParty, {
      rows: terms.secondPartyRows.map(({ label, value }) => ({ label, value })),
    });
  }
  return rows;
}
