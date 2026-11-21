import "server-only";

import {
  getMerchantRow,
  updateMerchantRow,
} from "@/lib/field-ops/merchant-repository";

import {
  insertContractRow,
  listContractRows,
  setContractStatusRow,
} from "./repository";

/**
 * Keeps the contract register and the merchant agreement state in step.
 *
 * They are two records of one fact. The merchant state drives the funnel and
 * the field workflow; the contract is its paperwork. Before this module the two
 * only met by hand: signing a contract left the merchant at "اتفاق نهائي", and
 * marking a merchant signed in the profile left its contract pending. Each
 * direction now writes the other side in the same request.
 *
 * The sync is intentionally one-way per call (contract→merchant or
 * merchant→contract), never a database trigger: a trigger would also fire for
 * bulk imports and historical backfills and could silently mass-sign rows.
 */

/**
 * A signed contract makes the merchant a signed merchant.
 *
 * The stored column is bumped (the repository touches `updated_at`), which is
 * what `app.merchant_state_rollup` ranks, so every screen resolves the new
 * state. `edit_unlocked` is cleared for the same reason a manual signature
 * clears it: the negotiated rate is now final.
 */
export async function syncMerchantSignedFromContract(
  merchantId: string,
): Promise<void> {
  const merchant = await getMerchantRow(merchantId);
  if (!merchant || merchant.contractState === "signed_contract") return;

  await updateMerchantRow(merchantId, {
    contractState: "signed_contract",
    editUnlocked: false,
  });
}

type SignedMerchant = {
  id: string;
  name: string;
  cityId: string | null;
  agreedCommission?: number | null;
  targetCommission?: number | null;
};

/**
 * A merchant marked signed makes its paperwork signed.
 *
 * Order of preference: advance the merchant's newest open contract; otherwise
 * create and sign one when the merchant has no contract at all. A merchant that
 * already has a signed contract and no open draft is left alone, so a second
 * state decision cannot mint duplicate executed contracts.
 */
export async function syncContractSignedFromMerchant(
  merchant: SignedMerchant,
  actor: { id: string; name: string },
): Promise<void> {
  const mine = (await listContractRows()).filter(
    (contract) => contract.merchantId === merchant.id,
  );
  const open = mine.filter(
    (contract) =>
      contract.status === "draft" || contract.status === "pending_signature",
  );

  if (open.length > 0) {
    const target = open[0];
    await setContractStatusRow(
      target.id,
      "signed",
      actor.id,
      actor.name,
      target.status,
    );
    return;
  }

  if (mine.some((contract) => contract.status === "signed")) return;

  const commission =
    merchant.agreedCommission ??
    (merchant.targetCommission && merchant.targetCommission > 0
      ? merchant.targetCommission
      : null);

  const created = await insertContractRow(
    {
      merchantId: merchant.id,
      merchantName: merchant.name,
      cityId: merchant.cityId || null,
      value: 0,
      currency: "EGP",
      body:
        commission !== null
          ? `عقد مُعتمد من ملف التاجر بنسبة عمولة ${commission}%.`
          : "عقد مُعتمد من ملف التاجر.",
    },
    actor.id,
  );

  await setContractStatusRow(created.id, "signed", actor.id, actor.name, "draft");
}
