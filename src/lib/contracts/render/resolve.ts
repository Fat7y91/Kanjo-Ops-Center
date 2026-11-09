import "server-only";

import { getMerchantById } from "@/lib/field-ops/store";
import { findContractTerms } from "../terms-repository";
import { resolveBusinessType } from "./constants";
import { getBaseName, sanitizeLegalText } from "./format";
import type { ContractDocumentInput } from "./input";
import { resolveLogoDataUri } from "./logo";
import type { Contract } from "../types";

/**
 * Maps a stored contract plus its merchant into the renderer's input.
 *
 * The contract row carries the free-form `body` an operator typed; the document
 * is rendered from structured terms when present (operator-edited clauses,
 * commission, and narrative overrides) and from the canonical generator
 * otherwise. Missing merchant data degrades to safe blanks rather than failing
 * the render.
 */
export async function resolveContractDocumentInput(
  contract: Contract,
): Promise<ContractDocumentInput> {
  const merchant = await getMerchantById(contract.merchantId);
  const terms = await findContractTerms(contract.id);

  const rawName = contract.merchantName || merchant?.name || "";
  const baseName = getBaseName(rawName) || rawName;
  const merchantName = sanitizeLegalText(baseName) || baseName;

  const category = sanitizeLegalText(merchant?.vendorType ?? "") || merchant?.vendorType || "غير محدد";
  const businessType = resolveBusinessType(category, null);

  const agreed = merchant?.agreedCommission;
  const target = merchant?.targetCommission;
  const displayRate =
    typeof agreed === "number" && Number.isFinite(agreed)
      ? agreed
      : typeof target === "number" && Number.isFinite(target)
        ? target
        : 0;

  // Resolve the merchant logo to an embeddable data URI (or drop it) before the
  // document is built: a bad remote logo would otherwise reject the whole
  // render on the edge runtime.
  const merchantLogo = await resolveLogoDataUri(merchant?.logoUrl ?? "");

  const activeClauses = terms?.clauses.filter((clause) => clause.enabled) ?? [];
  const commissionLines = terms?.commissionLines ?? [];
  const exceptions = commissionLines
    .filter((line) => line.category.trim().length > 0)
    .map((line) => ({ category: line.category, rate: line.rate }));

  return {
    merchantId: contract.merchantId,
    merchantName,
    businessType,
    category,
    displayRate,
    baseCommission: terms?.baseCommission ?? null,
    exceptions,
    achievedPercent: displayRate,
    financialSpecialException: "",
    jurisdictionClause: "",
    contactName: merchant?.contact?.name ?? "",
    contactPhone: merchant?.contact?.mobile ?? "",
    address: "",
    merchantLogo,
    clauses: activeClauses.length > 0 ? activeClauses : undefined,
    preamble: terms?.preamble ?? undefined,
    copiesNote: terms?.copiesNote ?? undefined,
    firstPartyRows: terms?.firstPartyRows ?? undefined,
    secondPartyRows: terms?.secondPartyRows ?? undefined,
    summaryNote: terms?.summaryNote ?? undefined,
  };
}
