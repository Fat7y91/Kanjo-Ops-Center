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
import { requireMerchant } from "./merchants";
import { updateMerchantRow } from "../merchant-repository";

export function listStateOverrides(merchantId?: string): StateOverride[] {
  const overrides = clone(getStore().overrides).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return merchantId
    ? overrides.filter((entry) => entry.merchantId === merchantId)
    : overrides;
}

export async function setMerchantState(
  merchantId: string,
  state: ContractState,
  note: string,
  actor: Actor,
  agreedCommission?: number | null,
  /**
   * The resolved state *before* this decision. The caller resolves it from the
   * rollup, because the override's `fromState` is audit data and the stored
   * column only knows what this isolate last wrote.
   */
  previousState?: ContractState,
): Promise<{ merchant: Merchant; override: StateOverride }> {
  const store = getStore();
  const merchant = await requireMerchant(merchantId);

  const previous = previousState ?? merchant.contractState;

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
  }

  const lockedCommission =
    state === "signed_contract"
      ? (agreedCommission ?? merchant.agreedCommission ?? null)
      : (merchant.agreedCommission ?? null);

  const commissionAmount =
    state === "signed_contract"
      ? calculateCommission(
          merchant.monthlyValue,
          lockedCommission ?? merchant.targetCommission,
        )
      : 0;

  const updated = await updateMerchantRow(merchantId, {
    contractState: state,
    commissionAmount,
    agreedCommission: lockedCommission,
    editUnlocked: false,
  });
  const saved = updated ?? {
    ...merchant,
    contractState: state,
    commissionAmount,
    agreedCommission: lockedCommission,
    editUnlocked: false,
  };

  const override: StateOverride = {
    id: id("override"),
    merchantId: saved.id,
    merchantName: saved.name,
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
    merchantId: saved.id,
    merchantName: saved.name,
    taskId: null,
    repId: actor.id,
    repName: actor.name,
    team: actor.team,
    outcome: state,
    previousState: previous,
    notes: `Manager state override: ${note.trim()}`,
    commissionAmount,
    agreedCommission:
      state === "signed_contract" ? (lockedCommission ?? null) : null,
    createdAt: isoNow(),
  };
  store.reports.push(report);
  bump();

  return { merchant: clone(saved), override: clone(override) };
}
