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
import type { VisitReportInput } from "@/lib/schemas/visit";

import { loadMerchantState } from "../state-source";
import { clone, FieldOpsError, id, isoNow, type Actor } from "./core";
import { mergeOpinions } from "./crm";
import { loadVisitReports } from "./report-source";
import { requireMerchant } from "./merchants";
import { updateMerchantRow } from "../merchant-repository";
import {
  completeTaskRow,
  insertFollowUp,
  insertTask,
  listFollowUpRows,
} from "../task-repository";

export async function listVisitReports(
  merchantId?: string,
  preloaded?: VisitReport[],
): Promise<VisitReport[]> {
  const reports = preloaded ?? (await loadVisitReports(merchantId));
  return merchantId
    ? reports.filter((report) => report.merchantId === merchantId)
    : reports;
}

/**
 * How many visits a merchant has ever had. The first-visit gate for advanced
 * outcomes is derived from this count, so it stays correct even when the
 * earlier visit was logged offline and flushed later.
 *
 * The read is narrowed by merchant in the query: a rep submitting a report must
 * not pay for the whole network's visit history.
 */
export async function visitCountFor(merchantId: string): Promise<number> {
  const reports = await loadVisitReports(merchantId);
  return reports.filter((report) => report.merchantId === merchantId).length;
}

export async function listFollowUpTasks(
  merchantId?: string,
): Promise<FollowUpTask[]> {
  return listFollowUpRows(merchantId);
}

export async function createVisitReport(
  merchantId: string,
  input: VisitReportInput,
  actor: Actor,
  options: { canManageState: boolean },
): Promise<{
  report: VisitReport;
  merchant: Merchant;
  followUp: FollowUpTask | null;
  duplicate: boolean;
}> {
  const merchant = await requireMerchant(merchantId);

  // Offline flush is idempotent: a retried clientVisitId must not duplicate.
  // The check reads the durable table, so a replay served by a different
  // isolate is recognised before the merchant state is touched.
  if (input.clientVisitId) {
    const known = await loadVisitReports(merchantId);
    const existing = known.find(
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

  const current = await loadMerchantState(merchant);
  const priorVisits = await visitCountFor(merchantId);
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
  const commissionAmount = 0;
  const agreedCommission = input.agreedCommission ?? null;
  const recordsAgreedCommission = COMMISSION_OUTCOMES.includes(outcome);

  if (input.taskId) {
    await completeTaskRow(input.taskId);
  }

  // CRM roll-up: the newest contact block wins, while opinions merge per trait
  // keeping the strongest weight, so the card shows the most recent intensity
  // each rep has expressed without letting a weak signal overwrite a strong one.
  const contact = input.contact ?? null;
  const nextContact =
    contact && (contact.name || contact.role || contact.mobile)
      ? {
          name: contact.name.trim(),
          role: contact.role.trim(),
          mobile: contact.mobile.trim(),
        }
      : (merchant.contact ?? null);
  const nextOpinions = mergeOpinions(
    merchant.opinions ?? [],
    input.opinions ?? [],
  );
  const visitedAt = isoNow();

  const persisted = await updateMerchantRow(merchant.id, {
    contractState: outcome,
    commissionAmount,
    agreedCommission: recordsAgreedCommission
      ? agreedCommission
      : (merchant.agreedCommission ?? null),
    editUnlocked: false,
    lastVisitAt: visitedAt,
    contact: nextContact,
    contactUpdatedAt:
      contact && (contact.name || contact.role || contact.mobile)
        ? visitedAt
        : (merchant.contactUpdatedAt ?? null),
    opinions: nextOpinions,
  });
  const saved: Merchant = persisted ?? {
    ...merchant,
    contractState: outcome,
    commissionAmount,
    agreedCommission: recordsAgreedCommission
      ? agreedCommission
      : (merchant.agreedCommission ?? null),
    editUnlocked: false,
    lastVisitAt: visitedAt,
    contact: nextContact,
    contactUpdatedAt: merchant.contactUpdatedAt ?? null,
    opinions: nextOpinions,
  };

  // Normalise once: the form sends "" when no follow-up is selected, and a
  // blank string would otherwise be persisted and later treated as a number.
  const followUpContactNumber = input.followUpContactNumber?.trim() || null;

  // The durable copy lives in `app.visit_reports` (`id uuid`), so the id must
  // be a real UUID rather than the readable `report-xxxxxxxx` store prefix.
  const report: VisitReport = {
    id: crypto.randomUUID(),
    merchantId: saved.id,
    merchantName: saved.name,
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
    contact: saved.contact ?? null,
    opinions: input.opinions ?? [],
    followUpAt: input.followUpAt ?? null,
    followUpTaskId: null,
    followUpContactNumber,
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
      merchantId: saved.id,
      merchantName: saved.name,
      team: saved.team ?? actor.team,
      cityId: saved.cityId,
      visitDate: followUpDate,
      dueAt: input.followUpAt,
      kind: input.followUpKind ?? "visit",
      note: input.followUpNote?.trim() || input.notes.trim().slice(0, 160),
      contactNumber: followUpContactNumber,
      status: "scheduled",
      createdBy: actor.id,
      createdByName: actor.name,
      createdAt: isoNow(),
      sourceReportId: report.id,
    };
    report.followUpTaskId = followUp.id;
    const storedFollowUp = await insertFollowUp(followUp);
    followUp = storedFollowUp;

    // A follow-up is a real board task for the whole team, not a private note.
    if (saved.team) {
      await insertTask({
        id: id("task"),
        merchantId: saved.id,
        merchantName: saved.name,
        team: saved.team,
        cityId: saved.cityId,
        visitDate: followUpDate,
        targetCommission: saved.targetCommission,
        strategicNotes: saved.strategicNotes,
        instructions:
          followUp.kind === "call"
            ? `متابعة هاتفية مجدولة من زيارة ${report.repName}.`
            : followUp.kind === "whatsapp"
              ? `متابعة واتساب مجدولة من زيارة ${report.repName}.`
              : `زيارة متابعة مجدولة من زيارة ${report.repName}.`,
        status: "scheduled",
        followUpKind: followUp.kind,
        followUpContactNumber,
        createdBy: actor.id,
        createdByName: actor.name,
        createdAt: isoNow(),
      });
    }
  }

  return {
    report,
    merchant: saved,
    followUp,
    duplicate: false,
  };
}
