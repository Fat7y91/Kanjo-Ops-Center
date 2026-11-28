import "server-only";

import { attachContractCommissionRates } from "./commission-repository";
import { ContractRepositoryError } from "./errors";
import {
  logContractAudit,
  reconcileMerchantFromContractRate,
  reconcileMerchantFromContractState,
} from "./governance-sync";
import { countContractOrders } from "./order-counts";
import {
  deleteContractRow,
  findContractRow,
  setContractStatusRow,
} from "./repository";
import { setContractBaseCommission } from "./terms-repository";
import type { Contract } from "./types";

/**
 * Governance actions on an executed contract. The API route has already checked
 * the capability; this module owns the state rules, the merchant mirror and the
 * audit trail. Money that already posted to the journal is untouched — only the
 * displayed headline rate and the profile's current agreement move.
 */

type Actor = { id: string; name: string };

async function requireContract(id: string): Promise<Contract> {
  const contract = await findContractRow(id);
  if (!contract) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }
  return contract;
}

/** Rewrites the headline commission and reconciles the merchant profile. */
export async function amendSignedContract(
  id: string,
  input: { commissionRate: number; note?: string },
  actor: Actor,
): Promise<Contract> {
  const contract = await requireContract(id);
  if (contract.status !== "signed") {
    throw new ContractRepositoryError(
      "CONTRACT_NOT_SIGNED",
      "لا يمكن تعديل نسبة العمولة إلا لعقد موقّع.",
      409,
    );
  }

  await setContractBaseCommission(id, input.commissionRate);
  try {
    await reconcileMerchantFromContractRate({
      contract,
      rate: input.commissionRate,
      actor,
    });
  } catch (error) {
    console.error("Merchant rate reconciliation failed", {
      contractId: id,
      error,
    });
  }

  const [updated] = await attachContractCommissionRates([contract]);
  return updated ?? { ...contract, commissionRate: input.commissionRate };
}

/** Returns an executed or cancelled contract to draft and reopens the profile. */
export async function reopenSignedContract(
  id: string,
  note: string | undefined,
  actor: Actor,
): Promise<Contract> {
  const contract = await requireContract(id);
  if (contract.status !== "signed" && contract.status !== "cancelled") {
    throw new ContractRepositoryError(
      "CONTRACT_ALREADY_OPEN",
      "العقد مفتوح بالفعل.",
      409,
    );
  }

  const updated = await setContractStatusRow(
    id,
    "draft",
    actor.id,
    undefined,
    contract.status,
  );
  if (!updated) {
    throw new ContractRepositoryError(
      "CONTRACT_TRANSITION",
      "تغيّرت حالة العقد أثناء التنفيذ. أعد تحميل السجل ثم حاول مجدداً.",
      409,
    );
  }

  try {
    await reconcileMerchantFromContractState({
      contract: updated,
      nextState: "final_contract",
      actor,
      actionType: "contract.reopened",
      description: note?.trim()
        ? `إعادة فتح العقد: ${note.trim()}`
        : "إعادة فتح العقد للمراجعة.",
    });
  } catch (error) {
    console.error("Merchant state reconciliation failed on reopen", {
      contractId: id,
      error,
    });
  }
  return updated;
}

/** Terminates a signed contract and clears the merchant's agreement state. */
export async function terminateSignedContract(
  id: string,
  note: string | undefined,
  actor: Actor,
): Promise<Contract> {
  const contract = await requireContract(id);
  if (contract.status !== "signed") {
    throw new ContractRepositoryError(
      "CONTRACT_NOT_SIGNED",
      "الإنهاء متاح للعقود الموقّعة فقط.",
      409,
    );
  }

  const updated = await setContractStatusRow(
    id,
    "cancelled",
    actor.id,
    undefined,
    "signed",
  );
  if (!updated) {
    throw new ContractRepositoryError(
      "CONTRACT_TRANSITION",
      "تغيّرت حالة العقد أثناء التنفيذ. أعد تحميل السجل ثم حاول مجدداً.",
      409,
    );
  }

  try {
    await reconcileMerchantFromContractState({
      contract: updated,
      nextState: "no_agreement",
      actor,
      actionType: "contract.terminated",
      description: note?.trim()
        ? `إنهاء العقد: ${note.trim()}`
        : "إنهاء العقد الموقّع.",
    });
  } catch (error) {
    console.error("Merchant state reconciliation failed on terminate", {
      contractId: id,
      error,
    });
  }
  return updated;
}

/** Permanently deletes a terminal contract, but only when it has no orders. */
export async function deleteSignedContract(
  id: string,
  actor: Actor,
): Promise<{ reference: string }> {
  const contract = await requireContract(id);
  if (contract.status !== "signed" && contract.status !== "cancelled") {
    throw new ContractRepositoryError(
      "CONTRACT_NOT_TERMINAL",
      "الحذف النهائي متاح للعقود الموقّعة أو الملغاة فقط.",
      409,
    );
  }

  const orderCount = await countContractOrders(contract);
  if (orderCount > 0) {
    throw new ContractRepositoryError(
      "CONTRACT_HAS_ORDERS",
      "هذا العقد مرتبط بطلبات مسجّلة، لذا لا يمكن حذفه نهائياً. يمكنك تعديل نسبة العمولة أو إنهاء العقد بدلاً من الحذف.",
      409,
    );
  }

  const removed = await deleteContractRow(id);
  if (!removed) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }
  await logContractAudit({
    actor,
    actionType: "contract.deleted",
    contract,
    description: "حذف العقد نهائياً (لا توجد طلبات مرتبطة).",
    previousData: {
      status: contract.status,
      commissionRate: contract.commissionRate,
    },
  });
  return { reference: contract.reference };
}
