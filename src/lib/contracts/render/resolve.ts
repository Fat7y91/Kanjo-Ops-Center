import "server-only";

import { getMerchantById } from "@/lib/field-ops/store";
import { resolveBusinessType } from "./constants";
import { getBaseName, sanitizeLegalText } from "./format";
import type { ContractDocumentInput } from "./input";
import type { Contract } from "../types";

/**
 * Maps a stored contract plus its merchant into the renderer's input.
 *
 * The contract row carries the free-form `body` an operator typed; the document
 * is rendered from the merchant classification and commission instead of that
 * blob so the legal clauses stay canonical. Missing merchant data degrades to
 * safe blanks rather than failing the render.
 */
export async function resolveContractDocumentInput(
  contract: Contract,
): Promise<ContractDocumentInput> {
  const merchant = await getMerchantById(contract.merchantId);

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

  return {
    merchantId: contract.merchantId,
    merchantName,
    businessType,
    category,
    displayRate,
    baseCommission: null,
    exceptions: [],
    achievedPercent: displayRate,
    financialSpecialException: "",
    jurisdictionClause: "",
    contactName: merchant?.contact?.name ?? "",
    contactPhone: merchant?.contact?.mobile ?? "",
    address: "",
    merchantLogo: merchant?.logoUrl ?? "",
  };
}
