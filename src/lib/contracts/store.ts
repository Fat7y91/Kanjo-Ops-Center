import {
  CONTRACT_ACTION_INPUT,
  CONTRACT_DRAFT_INPUT,
  CONTRACT_EDIT_INPUT,
  type Contract,
  type ContractActionInput,
  type ContractDraftInput,
  type ContractEditInput,
} from "./types";
import { attachContractCommissionRates } from "./commission-repository";
import { setContractBaseCommission } from "./terms-repository";
import { syncMerchantSignedFromContract } from "./sync";
import {
  ContractRepositoryError,
  findContractRow,
  insertContractRow,
  isContractsDatabaseConfigured,
  listContractRows,
  setContractStatusRow,
  updateContractRow,
} from "./repository";

export { ContractRepositoryError as ContractError };

/**
 * Tier 3 contract rules.
 *
 * The register is durable, so the workflow the page advertises is real:
 * draft → send for signature → sign, with cancellation from an open state. The
 * transition table lives here; the capability gate lives in the API route, so
 * a viewer without `sign_contract` is rejected before this module is called and
 * the SQL trigger refuses any write to a terminal row.
 */

const TRANSITIONS: Record<Contract["status"], Contract["status"][]> = {
  /* A draft may go straight to signature: an authorised signer can execute the
   * paperwork without the intermediate "waiting for signature" step. */
  draft: ["pending_signature", "signed", "cancelled"],
  pending_signature: ["signed", "cancelled"],
  signed: [],
  cancelled: [],
};

export function isContractsConfigured(): boolean {
  return isContractsDatabaseConfigured();
}

export async function listContracts(): Promise<Contract[]> {
  return attachContractCommissionRates(await listContractRows());
}

export async function draftContract(
  input: ContractDraftInput,
  actorId: string | null,
): Promise<Contract> {
  const parsed = CONTRACT_DRAFT_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new ContractRepositoryError(
      "INVALID_CONTRACT",
      parsed.error.errors[0]?.message ?? "بيانات العقد غير مكتملة.",
    );
  }
  const contract = await insertContractRow(parsed.data, actorId);
  if (parsed.data.commissionRate != null) {
    await setContractBaseCommission(contract.id, parsed.data.commissionRate);
  }
  return contract;
}

export async function editContract(
  id: string,
  input: ContractEditInput,
  actorId: string | null,
): Promise<Contract> {
  const parsed = CONTRACT_EDIT_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new ContractRepositoryError(
      "INVALID_CONTRACT",
      parsed.error.errors[0]?.message ?? "بيانات العقد غير صالحة.",
    );
  }

  const current = await findContractRow(id);
  if (!current) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }
  if (current.status === "signed" || current.status === "cancelled") {
    throw new ContractRepositoryError(
      "CONTRACT_TERMINAL",
      "لا يمكن تعديل عقد موقّع أو ملغى.",
      409,
    );
  }

  const updated = await updateContractRow(
    id,
    {
      merchantName: parsed.data.merchantName,
      cityId: parsed.data.cityId,
      valueMinor:
        parsed.data.value === undefined
          ? undefined
          : Math.round(parsed.data.value * 100),
      currency: parsed.data.currency,
      body: parsed.data.body,
    },
    actorId,
  );
  if (!updated) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }
  if (parsed.data.commissionRate != null) {
    await setContractBaseCommission(id, parsed.data.commissionRate);
  }
  return updated;
}

export async function applyContractAction(
  id: string,
  input: ContractActionInput,
  actor: { id: string; name: string },
): Promise<Contract> {
  const parsed = CONTRACT_ACTION_INPUT.safeParse(input);
  if (!parsed.success) {
    throw new ContractRepositoryError("INVALID_ACTION", "إجراء العقد غير صالح.");
  }

  const current = await findContractRow(id);
  if (!current) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }

  const next =
    parsed.data.action === "send"
      ? "pending_signature"
      : parsed.data.action === "sign"
        ? "signed"
        : "cancelled";

  if (!TRANSITIONS[current.status].includes(next)) {
    throw new ContractRepositoryError(
      "CONTRACT_TRANSITION",
      "لا يمكن تنفيذ هذا الإجراء على حالة العقد الحالية.",
      409,
    );
  }
  // Signing is the click itself: the authenticated operator is the signatory,
  // so the stored name can never drift from the account that advanced the row.
  const signatory = actor.name.trim().slice(0, 120) || actor.id;

  // Guard the write on the state we just read. If another operator (or a second
  // click) advanced the row first, the update matches no row and we answer 409
  // instead of letting the SQL terminal trigger raise a raw 500.
  const updated = await setContractStatusRow(
    id,
    next,
    actor.id,
    next === "signed" ? signatory : undefined,
    current.status,
  );
  if (!updated) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }
  if (next === "signed") {
    // The signature is the moment the merchant becomes signed. A failure here
    // must not hide the executed contract, so it is logged rather than thrown;
    // the next contract read repairs the merchant state.
    try {
      await syncMerchantSignedFromContract(updated.merchantId);
    } catch (syncError) {
      console.error("Merchant state sync failed after contract signature", {
        contractId: updated.id,
        merchantId: updated.merchantId,
        syncError,
      });
    }
  }
  return updated;
}
