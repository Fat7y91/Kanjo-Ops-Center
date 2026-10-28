import type { Merchant, MerchantDocument } from "@/lib/field-ops/types";
import type { MerchantDocumentInput } from "@/lib/schemas/field-ops";

import {
  FieldOpsError,
  bump,
  clone,
  getStore,
  id,
  isoNow,
  type Actor,
} from "./core";

export function addMerchantDocument(
  merchantId: string,
  input: MerchantDocumentInput,
  actor: Actor,
): Merchant {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  if (
    merchant.contractState !== "final_contract" &&
    merchant.contractState !== "signed_contract"
  ) {
    throw new FieldOpsError(
      "AGREEMENT_REQUIRED",
      "تُفتح المستندات فقط بعد الاتفاق النهائي أو توقيع العقد.",
      423,
    );
  }

  const document: MerchantDocument = {
    id: id("doc"),
    name: input.name.trim(),
    type: input.type,
    url: input.url.trim(),
    uploadedAt: isoNow(),
    uploadedBy: actor.id,
  };
  merchant.documents.push(document);
  merchant.updatedAt = isoNow();
  bump();
  return clone(merchant);
}
