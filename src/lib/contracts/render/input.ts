import type { ClauseRenderInput } from "./clauses";
import type { ContractClauseTemplate } from "./data/clauses";

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
  displayRate: number;
  baseCommission: number | null;
  exceptions: { category: string; rate: number }[];
  vipPreContract?: boolean;
  contactName?: string;
  contactPhone?: string;
  address?: string;
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
