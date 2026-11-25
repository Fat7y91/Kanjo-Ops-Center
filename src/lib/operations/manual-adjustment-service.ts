import "server-only";

import {
  normalizeManualAdjustmentPayload,
  parseAdjustmentAccountRef,
} from "./manual-adjustment";
import { OperationsError } from "./errors";
import {
  postManualAdjustment,
  resolvePartyLedgerAccount,
} from "./manual-adjustment-repository";
import {
  requireOperationsDatabase,
  translateOperationError,
} from "./service-guards";
import { manualAdjustmentInputSchema } from "./types";

export async function submitManualAdjustment(
  accountRef: string,
  actorId: string,
  rawInput: unknown,
): Promise<string> {
  requireOperationsDatabase();

  const ref = parseAdjustmentAccountRef(accountRef);
  if (!ref) {
    throw new OperationsError(
      "ADJUSTMENT_ACCOUNT_INVALID",
      "معرّف الحساب غير صالح. أرسل معرّف الحساب أو بادئة courier:/merchant:.",
      422,
    );
  }

  const input = manualAdjustmentInputSchema.parse(
    normalizeManualAdjustmentPayload(rawInput),
  );

  try {
    const accountId =
      ref.kind === "account"
        ? ref.accountId
        : await resolvePartyLedgerAccount(ref.partyType, ref.partyId);
    return await postManualAdjustment(accountId, actorId, input);
  } catch (error) {
    translateOperationError(error);
  }
}
