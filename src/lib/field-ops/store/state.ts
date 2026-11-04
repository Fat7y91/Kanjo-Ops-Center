import type {
  ContractState,
  Merchant,
  StateOverride,
  VisitReport,
} from "@/lib/field-ops/types";

import { FieldOpsError, isoNow, type Actor } from "./core";
import { calculateCommission } from "./crm";
import { requireMerchant } from "./merchants";
import { updateMerchantRow } from "../merchant-repository";
import {
  isMerchantStateDatabaseConfigured,
  listStateOverrideRows,
  persistStateOverride,
} from "../merchant-state-repository";
import {
  isVisitReportsDatabaseConfigured,
  persistVisitReport,
} from "../reports-repository";

/**
 * Manager agreement-state decisions.
 *
 * The decision itself is append-only governance history in
 * `app.merchant_state_overrides`, and it also writes a visit-shaped audit row so
 * the merchant timeline reads as one chronological story. Neither write is
 * accepted when the database is missing: a state change that only lives in the
 * isolate that served it is worse than a visible error.
 */

export async function listStateOverrides(
  merchantId?: string,
): Promise<StateOverride[]> {
  return listStateOverrideRows(merchantId);
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
  // Check before touching the merchant row: a state change whose audit trail
  // cannot be written must not half-apply.
  if (
    !isMerchantStateDatabaseConfigured() ||
    !isVisitReportsDatabaseConfigured()
  ) {
    throw new FieldOpsError(
      "STATE_AUDIT_UNAVAILABLE",
      "قاعدة بيانات قرارات الحالة غير متصلة.",
      503,
    );
  }
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
    id: crypto.randomUUID(),
    merchantId: saved.id,
    merchantName: saved.name,
    fromState: previous,
    toState: state,
    actorId: actor.id,
    actorName: actor.name,
    note: note.trim(),
    createdAt: isoNow(),
  };
  const overrideResult = await persistStateOverride(override, actor.id);
  if (overrideResult === "unavailable") {
    throw new FieldOpsError(
      "STATE_AUDIT_UNAVAILABLE",
      "تعذر تسجيل قرار الحالة في قاعدة البيانات.",
      503,
    );
  }

  const report: VisitReport = {
    id: crypto.randomUUID(),
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
    source: "override",
  };
  const reportResult = await persistVisitReport(report, actor.id);
  if (reportResult !== "stored" && reportResult !== "duplicate") {
    throw new FieldOpsError(
      "STATE_AUDIT_UNAVAILABLE",
      "تعذر تسجيل قرار الحالة في قاعدة البيانات.",
      503,
    );
  }

  return { merchant: saved, override };
}
