import type {
  ContractState,
  FollowUpTask,
  Merchant,
  VisitReport,
} from "@/lib/field-ops/types";
import {
  ADVANCED_OUTCOMES,
  COMMISSION_OUTCOMES,
  isRepOutcome,
} from "@/lib/field-ops/types";
import type { VisitReportInput } from "@/lib/schemas/field-ops";

import {
  FieldOpsError,
  bump,
  clone,
  getStore,
  id,
  isoNow,
  type Actor,
} from "./core";
import { mergeOpinions } from "./crm";

export function listVisitReports(merchantId?: string): VisitReport[] {
  const reports = clone(getStore().reports).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return merchantId
    ? reports.filter((report) => report.merchantId === merchantId)
    : reports;
}

/**
 * How many visits a merchant has ever had. The first-visit gate for advanced
 * outcomes is derived from this count, so it stays correct even when the
 * earlier visit was logged offline and flushed later.
 */
export function visitCountFor(merchantId: string): number {
  return getStore().reports.filter(
    (report) => report.merchantId === merchantId,
  ).length;
}

export function listFollowUpTasks(merchantId?: string): FollowUpTask[] {
  const tasks = clone(getStore().followUps ?? []).sort((left, right) =>
    right.dueAt.localeCompare(left.dueAt),
  );
  return merchantId
    ? tasks.filter((task) => task.merchantId === merchantId)
    : tasks;
}

export function createVisitReport(
  merchantId: string,
  input: VisitReportInput,
  actor: Actor,
  options: { canManageState: boolean },
): {
  report: VisitReport;
  merchant: Merchant;
  followUp: FollowUpTask | null;
  duplicate: boolean;
} {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }

  // Offline flush is idempotent: a retried clientVisitId must not duplicate.
  if (input.clientVisitId) {
    const existing = store.reports.find(
      (report) =>
        report.merchantId === merchantId &&
        report.clientVisitId === input.clientVisitId,
    );
    if (existing) {
      return {
        report: clone(existing),
        merchant: clone(merchant),
        followUp: null,
        duplicate: true,
      };
    }
  }

  const current = merchant.contractState;
  const priorVisits = visitCountFor(merchantId);
  const outcome = input.outcome as ContractState;

  // A rep can never submit a signature: that is an admin governance action on
  // the CRM card. Guard here too in case a stale client sends it.
  if (!isRepOutcome(input.outcome)) {
    throw new FieldOpsError(
      "SIGNED_MANAGER_ONLY",
      "اعتماد توقيع العقد متاح فقط لمديري الحالات من كارت التاجر.",
      403,
    );
  }

  // First-ever visits cannot claim a final agreement: there is no prior
  // agreement for that outcome to build on.
  if (priorVisits === 0 && ADVANCED_OUTCOMES.includes(outcome) && !options.canManageState) {
    throw new FieldOpsError(
      "FIRST_VISIT_GATE",
      "خيار «اتفاق نهائي» متاح فقط للتجار الذين لديهم زيارة سابقة. اختر نتيجة أساسية أولاً.",
      422,
    );
  }

  if (!options.canManageState) {
    if (current === "signed_contract") {
      throw new FieldOpsError(
        "SIGNED_LOCKED",
        "عقود التوقيع مقفلة تماماً. فقط عمليات المدن يمكنها تغييرها.",
        423,
      );
    }
    if (current === "final_contract" && !merchant.editUnlocked) {
      throw new FieldOpsError(
        "EDIT_REQUEST_REQUIRED",
        "هذا الاتفاق النهائي مقفل. أرسل طلب تعديل مع ذكر السبب لاعتماده من المدير.",
        423,
      );
    }
    if (
      current === "final_contract" &&
      outcome !== "final_contract" &&
      !merchant.editUnlocked
    ) {
      throw new FieldOpsError(
        "FINAL_LOCKED",
        "لا يمكن للمندوب التراجع عن حالة الاتفاق النهائي.",
        423,
      );
    }
  }

  if (
    COMMISSION_OUTCOMES.includes(outcome) &&
    (input.agreedCommission == null || input.agreedCommission <= 0)
  ) {
    throw new FieldOpsError(
      "COMMISSION_REQUIRED",
      "النسبة المتفق عليها مطلوبة عند الاتفاق المبدئي أو النهائي.",
      422,
    );
  }

  // Commission is only *earned* at signature; agreedCommission records the
  // negotiated percentage at every stage so the CRM card has the full picture.
  let commissionAmount = 0;
  if (COMMISSION_OUTCOMES.includes(outcome)) {
    merchant.agreedCommission = input.agreedCommission ?? null;
  }

  const agreedCommission = input.agreedCommission ?? null;

  merchant.contractState = outcome;
  merchant.commissionAmount = commissionAmount;
  merchant.editUnlocked = false;
  merchant.lastVisitAt = isoNow();
  merchant.updatedAt = isoNow();

  if (input.taskId) {
    const task = store.tasks.find((candidate) => candidate.id === input.taskId);
    if (task) {
      if (task.merchantId !== merchant.id) {
        throw new FieldOpsError(
          "TASK_MISMATCH",
          "هذه المهمة لا تتبع هذا التاجر.",
          400,
        );
      }
      task.status = "completed";
    }
  }

  // CRM roll-up: the newest contact block wins, while opinions merge per trait
  // keeping the strongest weight, so the card shows the most recent intensity
  // each rep has expressed without letting a weak signal overwrite a strong one.
  const contact = input.contact ?? null;
  if (contact && (contact.name || contact.role || contact.mobile)) {
    merchant.contact = {
      name: contact.name.trim(),
      role: contact.role.trim(),
      mobile: contact.mobile.trim(),
    };
    merchant.contactUpdatedAt = isoNow();
  }

  merchant.opinions = mergeOpinions(merchant.opinions ?? [], input.opinions ?? []);

  const report: VisitReport = {
    id: id("report"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    taskId: input.taskId ?? null,
    repId: actor.id,
    repName: actor.name,
    team: actor.team,
    outcome,
    previousState: current,
    notes: input.notes.trim(),
    commissionAmount,
    agreedCommission,
    createdAt: isoNow(),
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? null,
    durationSeconds: input.durationSeconds ?? null,
    startLocation: input.startLocation ?? null,
    endLocation: input.endLocation ?? null,
    contact: merchant.contact ?? null,
    opinions: input.opinions ?? [],
    followUpAt: input.followUpAt ?? null,
    followUpTaskId: null,
    source:
      input.source ??
      (input.taskId ? "task" : input.clientVisitId ? "offline" : "task"),
    clientVisitId: input.clientVisitId ?? null,
  };

  let followUp: FollowUpTask | null = null;
  if (input.followUpAt) {
    const followUpDate = input.followUpAt.slice(0, 10);
    followUp = {
      id: id("followup"),
      merchantId: merchant.id,
      merchantName: merchant.name,
      team: merchant.team ?? actor.team,
      cityId: merchant.cityId,
      visitDate: followUpDate,
      dueAt: input.followUpAt,
      kind: input.followUpKind ?? "visit",
      note: input.followUpNote?.trim() || input.notes.trim().slice(0, 160),
      status: "scheduled",
      createdBy: actor.id,
      createdByName: actor.name,
      createdAt: isoNow(),
      sourceReportId: report.id,
    };
    report.followUpTaskId = followUp.id;
    store.followUps = [...(store.followUps ?? []), followUp];

    // A follow-up is a real board task for the whole team, not a private note.
    if (merchant.team) {
      store.tasks.push({
        id: id("task"),
        merchantId: merchant.id,
        merchantName: merchant.name,
        team: merchant.team,
        cityId: merchant.cityId,
        visitDate: followUpDate,
        targetCommission: merchant.targetCommission,
        strategicNotes: merchant.strategicNotes,
        instructions:
          followUp.kind === "call"
            ? `متابعة هاتفية مجدولة من زيارة ${report.repName}.`
            : followUp.kind === "whatsapp"
              ? `متابعة واتساب مجدولة من زيارة ${report.repName}.`
              : `زيارة متابعة مجدولة من زيارة ${report.repName}.`,
        status: "scheduled",
        followUpKind: followUp.kind,
        createdBy: actor.id,
        createdByName: actor.name,
        createdAt: isoNow(),
      });
    }
  }

  store.reports.push(report);
  bump();

  return {
    report: clone(report),
    merchant: clone(merchant),
    followUp: followUp ? clone(followUp) : null,
    duplicate: false,
  };
}
