import type { Merchant, MerchantDocument } from "@/lib/field-ops/types";
import type { MerchantDocumentInput } from "@/lib/schemas/field-ops";

import { isoNow, FieldOpsError } from "./core";
import { requireMerchant } from "./merchants";
import { updateMerchantRow } from "../merchant-repository";

export async function addMerchantDocument(
  merchantId: string,
  input: MerchantDocumentInput,
  actor: { id: string },
): Promise<Merchant> {
  const merchant = await requireMerchant(merchantId);

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
    id: `doc-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    type: input.type,
    url: input.url.trim(),
    uploadedAt: isoNow(),
    uploadedBy: actor.id,
  };

  const updated = await updateMerchantRow(merchantId, {
    documents: [...merchant.documents, document],
  });
  return updated ?? merchant;
}
