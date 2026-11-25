import "server-only";

import { requireOperationsDatabase, translateOperationError } from "./service-guards";
import { postManualAdjustment } from "./manual-adjustment-repository";
import { manualAdjustmentInputSchema } from "./types";

export async function submitManualAdjustment(
  accountId: string,
  actorId: string,
  rawInput: unknown,
): Promise<string> {
  requireOperationsDatabase();
  const input = manualAdjustmentInputSchema.parse(rawInput);

  try {
    return await postManualAdjustment(accountId, actorId, input);
  } catch (error) {
    translateOperationError(error);
  }
}
