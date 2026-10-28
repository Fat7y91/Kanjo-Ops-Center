import type {
  ContractState,
  Merchant,
  StateOverride,
  VisitReport,
} from "@/lib/field-ops/types";

import {
  FieldOpsError,
  bump,
  clone,
  getStore,
  id,
  isoNow,
  type Actor,
} from "./core";
import { calculateCommission } from "./crm";

export function listStateOverrides(merchantId?: string): StateOverride[] {
  const overrides = clone(getStore().overrides).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return merchantId
    ? overrides.filter((entry) => entry.merchantId === merchantId)
    : overrides;
}

export function setMerchantState(
  merchantId: string,
  state: ContractState,
  note: string,
  actor: Actor,
  agreedCommission?: number | null,
): { merchant: Merchant; override: StateOverride } {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }

  const previous = merchant.contractState;

  // Signing is the one transition that must carry a final, locked commission
  // percentage. It is recorded on the merchant permanently and drives the
  // earned commission amount.
  if (state === "signed_contract") {
    if (agreedCommission == null || agreedCommission <= 0) {
      throw new FieldOpsError(
        "COMMISSION_REQUIRED",
        "النسبة النهائية المقفلة مطلوبة عند اعتماد توقيع العقد.",
        422,
      );
    }
    merchant.agreedCommission = agreedCommission;
  }

  const commissionAmount =
    state === "signed_contract"
      ? calculateCommission(merchant.monthlyValue, merchant.agreedCommission ?? merchant.targetCommission)
      : 0;

  merchant.contractState = state;
  merchant.commissionAmount = commissionAmount;
  merchant.editUnlocked = false;
  merchant.updatedAt = isoNow();

  const override: StateOverride = {
    id: id("override"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    fromState: previous,
    toState: state,
    actorId: actor.id,
    actorName: actor.name,
    note: note.trim(),
    createdAt: isoNow(),
  };
  store.overrides.push(override);

  const report: VisitReport = {
    id: id("report"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    taskId: null,
    repId: actor.id,
    repName: actor.name,
    team: actor.team,
    outcome: state,
    previousState: previous,
    notes: `Manager state override: ${note.trim()}`,
    commissionAmount,
    agreedCommission:
      state === "signed_contract" ? (merchant.agreedCommission ?? null) : null,
    createdAt: isoNow(),
  };
  store.reports.push(report);
  bump();

  return { merchant: clone(merchant), override: clone(override) };
}
