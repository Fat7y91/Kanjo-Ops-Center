import {
  CONTRACT_ACTION_INPUT,
  CONTRACT_DRAFT_INPUT,
  CONTRACT_EDIT_INPUT,
  type Contract,
  type ContractActionInput,
  type ContractDraftInput,
  type ContractEditInput,
} from "./types";
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
  draft: ["pending_signature", "cancelled"],
  pending_signature: ["signed", "cancelled"],
  signed: [],
  cancelled: [],
};

export function isContractsConfigured(): boolean {
  return isContractsDatabaseConfigured();
}

export async function listContracts(): Promise<Contract[]> {
  return listContractRows();
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
  return insertContractRow(parsed.data, actorId);
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
      signatory: parsed.data.signatory,
      body: parsed.data.body,
    },
    actorId,
  );
  if (!updated) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }
  return updated;
}

export async function applyContractAction(
  id: string,
  input: ContractActionInput,
  actorId: string | null,
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
  if (next === "signed" && !current.signatory && !parsed.data.signatory) {
    throw new ContractRepositoryError(
      "SIGNATORY_REQUIRED",
      "حدّد الجهة الموقّعة قبل التوقيع.",
      422,
    );
  }

  const updated = await setContractStatusRow(
    id,
    next,
    actorId,
    parsed.data.signatory,
  );
  if (!updated) {
    throw new ContractRepositoryError("CONTRACT_NOT_FOUND", "العقد غير موجود.", 404);
  }
  return updated;
}
