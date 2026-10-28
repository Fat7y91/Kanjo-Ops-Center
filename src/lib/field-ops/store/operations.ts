import { merchantSearchKey } from "@/lib/search/merchant-search";
import { normalizeSearchText } from "@/lib/search/normalize";
import type {
  City,
  ContractState,
  EditRequest,
  FieldTask,
  FollowUpKind,
  FollowUpTask,
  Merchant,
  MerchantDocument,
  RepOpinion,
  StateOverride,
  TransferRequest,
  VisitContact,
  VisitReport,
} from "@/lib/field-ops/types";
import {
  ADVANCED_OUTCOMES,
  COMMISSION_OUTCOMES,
  isRepOutcome,
  zoneToBoundary,
} from "@/lib/field-ops/types";
import type { AppUser } from "@/lib/rbac/types";
import {
  addUserCityScope,
  getUserById,
  listUsers,
  removeUserCityScope,
} from "@/lib/rbac/users";
import type {
  CityCreateInput,
  MerchantCreateInput,
  MerchantDocumentInput,
  TaskAssignInput,
  VisitReportInput,
} from "@/lib/schemas/field-ops";
import { assertVendorTypeExists } from "@/lib/taxonomy/store";

import {
  FieldOpsError,
  bump,
  clone,
  getStore,
  id,
  isoNow,
  todayIso,
  type Actor,
} from "./core";

export function listCities(): City[] {
  return clone(getStore().cities).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function getCityById(cityId: string): City | null {
  const city = getStore().cities.find((candidate) => candidate.id === cityId);
  return city ? clone(city) : null;
}

export function createCity(input: CityCreateInput, actor: Actor): City {
  const store = getStore();
  const normalized = normalizeSearchText(input.name);
  if (
    store.cities.some(
      (city) => normalizeSearchText(city.name) === normalized,
    )
  ) {
    throw new FieldOpsError(
      "CITY_EXISTS",
      "توجد مدينة بهذا الاسم بالفعل.",
      409,
    );
  }

  const zone = input.zone.map((point) => ({
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
  }));

  const city: City = {
    id: id("city"),
    name: input.name.trim(),
    country: input.country.trim(),
    governorate: input.governorate.trim(),
    population: input.population,
    stage: input.stage,
    competitors: input.competitors.map((competitor) => ({
      name: competitor.name.trim(),
      page: competitor.page.trim(),
      marketStrength: competitor.marketStrength,
    })),
    strategicNotes: input.strategicNotes.trim(),
    zone,
    boundary: zoneToBoundary(zone),
    opsManagers: [],
    createdAt: isoNow(),
    createdBy: actor.id,
    createdByName: actor.name,
  };

  store.cities.push(city);
  addUserCityScope(actor.id, city.id);
  bump();
  return clone(city);
}

export function updateCity(cityId: string, input: CityCreateInput): City {
  const store = getStore();
  const city = store.cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const normalized = normalizeSearchText(input.name);
  if (
    store.cities.some(
      (candidate) =>
        candidate.id !== cityId &&
        normalizeSearchText(candidate.name) === normalized,
    )
  ) {
    throw new FieldOpsError(
      "CITY_EXISTS",
      "توجد مدينة أخرى بهذا الاسم.",
      409,
    );
  }

  const zone = input.zone.map((point) => ({
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
  }));

  city.name = input.name.trim();
  city.country = input.country.trim();
  city.governorate = input.governorate.trim();
  city.population = input.population;
  city.stage = input.stage;
  city.competitors = input.competitors.map((competitor) => ({
    name: competitor.name.trim(),
    page: competitor.page.trim(),
    marketStrength: competitor.marketStrength,
  }));
  city.strategicNotes = input.strategicNotes.trim();
  city.zone = zone;
  city.boundary = zoneToBoundary(zone);

  bump();
  return clone(city);
}

export function listCityManagers(cityId: string): AppUser[] {
  const city = getStore().cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  return city.opsManagers
    .map((userId) => getUserById(userId))
    .filter((user): user is AppUser => Boolean(user));
}

export function listAssignableManagers(): AppUser[] {
  return listUsers().filter((user) => user.active);
}

export function assignCityManagers(
  cityId: string,
  userIds: readonly string[],
): City {
  const store = getStore();
  const city = store.cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const uniqueIds = Array.from(new Set(userIds.map((id) => id.trim()))).filter(
    Boolean,
  );
  if (uniqueIds.length === 0) {
    throw new FieldOpsError(
      "MANAGER_REQUIRED",
      "اختر مديراً واحداً على الأقل.",
      422,
    );
  }

  const users = uniqueIds.map((userId) => {
    const user = getUserById(userId);
    if (!user || !user.active) {
      throw new FieldOpsError(
        "MANAGER_NOT_FOUND",
        "أحد المشغّلين المحددين غير موجود أو غير نشط.",
        422,
      );
    }
    return user;
  });

  const next = new Set(city.opsManagers);
  for (const user of users) {
    next.add(user.id);
    addUserCityScope(user.id, cityId);
  }
  city.opsManagers = Array.from(next);

  bump();
  return clone(city);
}

export function revokeCityManager(cityId: string, userId: string): City {
  const city = getStore().cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  if (!city.opsManagers.includes(userId)) {
    throw new FieldOpsError(
      "MANAGER_NOT_ASSIGNED",
      "هذا المشغّل ليس مديراً للعمليات في المدينة.",
      404,
    );
  }

  city.opsManagers = city.opsManagers.filter(
    (managerId) => managerId !== userId,
  );
  removeUserCityScope(userId, cityId);
  bump();
  return clone(city);
}

export function listMerchants(): Merchant[] {
  return clone(getStore().merchants).sort((left, right) =>
    left.name.localeCompare(right.name, "ar"),
  );
}

export function getMerchantById(merchantId: string): Merchant | null {
  const merchant = getStore().merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  return merchant ? clone(merchant) : null;
}

export function listTasks(): FieldTask[] {
  return clone(getStore().tasks).sort((left, right) =>
    `${left.visitDate}-${left.merchantName}`.localeCompare(
      `${right.visitDate}-${right.merchantName}`,
      "ar",
    ),
  );
}

export function tasksForViewer(input: {
  team: string;
  canManageTasks: boolean;
  date: string;
}): FieldTask[] {
  const tasks = listTasks();
  if (input.canManageTasks) return tasks;
  // Reps see today's work plus any scheduled follow-up already booked for a
  // future date, so a follow-up created in a visit report is team-visible
  // immediately instead of silently appearing days later.
  return tasks.filter(
    (task) =>
      task.team === input.team &&
      (task.visitDate === input.date ||
        (task.status === "scheduled" && task.visitDate > input.date)),
  );
}

export function listVisitReports(merchantId?: string): VisitReport[] {
  const reports = clone(getStore().reports).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return merchantId
    ? reports.filter((report) => report.merchantId === merchantId)
    : reports;
}

export function listTransferRequests(): TransferRequest[] {
  return clone(getStore().transferRequests).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function listEditRequests(): EditRequest[] {
  return clone(getStore().editRequests).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function listStateOverrides(merchantId?: string): StateOverride[] {
  const overrides = clone(getStore().overrides).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return merchantId
    ? overrides.filter((entry) => entry.merchantId === merchantId)
    : overrides;
}

export function calculateCommission(
  monthlyValue: number,
  targetCommission: number,
): number {
  return Math.round(monthlyValue * targetCommission) / 100;
}

/**
 * Merge weighted opinions for the CRM roll-up.
 *
 * Each trait keeps ONE entry on the merchant: the highest weight ever recorded.
 * That way a rep flipping "cooperative" from 80% down to 20% on a later visit
 * does not erase the earlier strong signal, but a stronger read always wins.
 * Custom traits are keyed by their normalized label so the same wording
 * accumulates instead of producing duplicates.
 */
export function mergeOpinions(
  existing: RepOpinion[],
  incoming: RepOpinion[],
): RepOpinion[] {
  const merged = new Map<string, RepOpinion>();
  const keyFor = (opinion: RepOpinion) =>
    opinion.trait === "custom"
      ? `custom:${(opinion.label ?? "").trim().toLowerCase()}`
      : opinion.trait;

  for (const opinion of existing) {
    const key = keyFor(opinion);
    const current = merged.get(key);
    if (!current || opinion.weight > current.weight) merged.set(key, { ...opinion });
  }
  for (const opinion of incoming) {
    const key = keyFor(opinion);
    if (!key || key === "custom:") continue;
    const current = merged.get(key);
    if (!current || opinion.weight > current.weight) {
      merged.set(key, { ...opinion });
    }
  }
  return Array.from(merged.values()).sort((left, right) => right.weight - left.weight);
}

export function createMerchant(
  input: MerchantCreateInput,
  _actor: Actor,
): Merchant {
  const store = getStore();
  const city = store.cities.find((candidate) => candidate.id === input.cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const vendorType = assertVendorTypeExists(input.vendorTypeId);

  const normalizedName = merchantSearchKey(input.name);
  const existing = store.merchants.find(
    (candidate) => candidate.normalizedName === normalizedName,
  );
  if (existing) {
    throw new FieldOpsError(
      "MERCHANT_EXISTS",
      existing.cityId === input.cityId
        ? "يوجد تاجر بهذا الاسم في المدينة بالفعل."
        : "يوجد تاجر بهذا الاسم في مدينة أخرى. استخدم اسماً مميزاً.",
      409,
    );
  }

  const merchant: Merchant = {
    id: id("m"),
    name: input.name.trim(),
    normalizedName,
    vendorTypeId: input.vendorTypeId,
    vendorType: vendorType.name_ar,
    team: null,
    cityId: input.cityId,
    targetCommission: input.targetCommission,
    monthlyValue: input.estimatedMonthlyValue,
    strategicNotes: input.strategicNotes.trim(),
    contractState: "no_agreement",
    commissionAmount: 0,
    editUnlocked: false,
    documents: [],
    createdAt: isoNow(),
    updatedAt: isoNow(),
    lastVisitAt: null,
  };

  store.merchants.push(merchant);
  bump();
  return clone(merchant);
}

export function assignMerchantTask(
  input: TaskAssignInput,
  actor: Actor,
): { task: FieldTask; merchant: Merchant } {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === input.merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError(
      "MERCHANT_NOT_FOUND",
      "التاجر المستهدف غير موجود.",
      404,
    );
  }

  const city = store.cities.find((candidate) => candidate.id === merchant.cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "مدينة التاجر غير موجودة.", 404);
  }
  if (city.stage === "preparation") {
    throw new FieldOpsError(
      "CITY_IN_PREPARATION",
      "المدينة في مرحلة الإعداد. انقلها إلى مرحلة التعاقدات قبل إسناد المهام.",
      409,
    );
  }

  if (merchant.team && merchant.team !== input.team) {
    throw new FieldOpsError(
      "TEAM_LOCKED",
      "ملكية هذا التاجر مثبتة لفريق آخر. استخدم طلب نقل الملكية بدلاً من إعادة الإسناد.",
      409,
    );
  }

  if (!merchant.team) {
    merchant.team = input.team;
  }
  merchant.updatedAt = isoNow();

  const task: FieldTask = {
    id: id("task"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    team: input.team,
    cityId: merchant.cityId,
    visitDate: input.visitDate,
    targetCommission: merchant.targetCommission,
    strategicNotes: merchant.strategicNotes,
    instructions: input.instructions.trim(),
    status: "scheduled",
    createdBy: actor.id,
    createdByName: actor.name,
    createdAt: isoNow(),
  };

  store.tasks.push(task);
  bump();

  return { task: clone(task), merchant: clone(merchant) };
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

/**
 * Chronological, cross-rep CRM timeline for a merchant card.
 *
 * Unlike the field-ops board (which is task-centric and team-filtered), this is
 * the single source for a manager reading a merchant's full history.
 */
export type MerchantTimelineEntry =
  | { kind: "visit"; at: string; report: VisitReport }
  | { kind: "override"; at: string; override: StateOverride }
  | { kind: "document"; at: string; document: MerchantDocument }
  | { kind: "follow_up"; at: string; followUp: FollowUpTask };

export function merchantTimeline(merchantId: string): MerchantTimelineEntry[] {
  const store = getStore();
  const entries: MerchantTimelineEntry[] = [];

  for (const report of store.reports) {
    if (report.merchantId === merchantId) {
      entries.push({
        kind: "visit",
        at: report.endedAt ?? report.createdAt,
        report: clone(report),
      });
    }
  }
  for (const override of store.overrides) {
    if (override.merchantId === merchantId) {
      entries.push({
        kind: "override",
        at: override.createdAt,
        override: clone(override),
      });
    }
  }
  for (const document of store.merchants.find((m) => m.id === merchantId)?.documents ?? []) {
    entries.push({
      kind: "document",
      at: document.uploadedAt,
      document: clone(document),
    });
  }
  for (const followUp of store.followUps ?? []) {
    if (followUp.merchantId === merchantId) {
      entries.push({
        kind: "follow_up",
        at: followUp.createdAt,
        followUp: clone(followUp),
      });
    }
  }

  return entries.sort((left, right) => right.at.localeCompare(left.at));
}

export type MerchantCrmSummary = {
  visitCount: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  lastVisitAt: string | null;
  lastOutcome: ContractState | null;
  opinions: RepOpinion[];
  contact: VisitContact | null;
  contactUpdatedAt: string | null;
  reps: string[];
  nextFollowUpAt: string | null;
};

export function merchantCrmSummary(merchantId: string): MerchantCrmSummary {
  const merchant = getStore().merchants.find((m) => m.id === merchantId);
  const visits = getStore().reports.filter(
    (report) => report.merchantId === merchantId,
  );
  const totalDuration = visits.reduce(
    (sum, report) => sum + (report.durationSeconds ?? 0),
    0,
  );
  const timed = visits.filter((report) => report.durationSeconds != null);
  const reps = Array.from(new Set(visits.map((report) => report.repName)));
  const sortedVisits = [...visits].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const openFollowUps = (getStore().followUps ?? [])
    .filter(
      (task) => task.merchantId === merchantId && task.status === "scheduled",
    )
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));

  return {
    visitCount: visits.length,
    totalDurationSeconds: totalDuration,
    averageDurationSeconds:
      timed.length > 0
        ? Math.round(
            timed.reduce((sum, report) => sum + (report.durationSeconds ?? 0), 0) /
              timed.length,
          )
        : 0,
    lastVisitAt: merchant?.lastVisitAt ?? null,
    lastOutcome: sortedVisits[0]?.outcome ?? null,
    opinions: [...(merchant?.opinions ?? [])].sort(
      (left, right) => right.weight - left.weight,
    ),
    contact: merchant?.contact ?? null,
    contactUpdatedAt: merchant?.contactUpdatedAt ?? null,
    reps,
    nextFollowUpAt: openFollowUps[0]?.dueAt ?? null,
  };
}

export function createTransferRequest(
  merchantId: string,
  justification: string,
  actor: Actor,
): TransferRequest {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  if (!merchant.team) {
    throw new FieldOpsError(
      "MERCHANT_UNASSIGNED",
      "هذا التاجر غير مسند لأي فريق بعد. أسنده إلى فريق أولاً.",
      409,
    );
  }
  if (merchant.team === actor.team) {
    throw new FieldOpsError(
      "SAME_TEAM",
      "هذا التاجر تابع لفريقك بالفعل.",
      400,
    );
  }
  if (
    store.transferRequests.some(
      (request) =>
        request.merchantId === merchantId &&
        request.requestedBy === actor.id &&
        request.status === "pending",
    )
  ) {
    throw new FieldOpsError(
      "TRANSFER_PENDING",
      "يوجد طلب نقل لهذا التاجر قيد المراجعة بالفعل.",
      409,
    );
  }

  const request: TransferRequest = {
    id: id("transfer"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    fromTeam: merchant.team,
    toTeam: actor.team,
    requestedBy: actor.id,
    requestedByName: actor.name,
    justification: justification.trim(),
    status: "pending",
    createdAt: isoNow(),
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
  };

  store.transferRequests.push(request);
  bump();
  return clone(request);
}

export function decideTransferRequest(
  requestId: string,
  decision: "approve" | "reject",
  actor: Actor,
  note: string,
): TransferRequest {
  const store = getStore();
  const request = store.transferRequests.find(
    (candidate) => candidate.id === requestId,
  );
  if (!request) {
    throw new FieldOpsError("TRANSFER_NOT_FOUND", "الطلب غير موجود.", 404);
  }
  if (request.status !== "pending") {
    throw new FieldOpsError(
      "TRANSFER_CLOSED",
      "تمت مراجعة طلب النقل هذا بالفعل.",
      409,
    );
  }

  request.status = decision === "approve" ? "approved" : "rejected";
  request.reviewedBy = actor.id;
  request.reviewedByName = actor.name;
  request.reviewedAt = isoNow();
  request.reviewNote = note.trim();

  if (decision === "approve") {
    const merchant = store.merchants.find(
      (candidate) => candidate.id === request.merchantId,
    );
    if (merchant) {
      merchant.team = request.toTeam;
      merchant.updatedAt = isoNow();
      store.tasks.forEach((task) => {
        if (
          task.merchantId === merchant.id &&
          task.status === "scheduled"
        ) {
          task.team = request.toTeam;
        }
      });
    }
  }

  bump();
  return clone(request);
}

export function createEditRequest(
  merchantId: string,
  reason: string,
  actor: Actor,
): EditRequest {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  if (merchant.contractState === "signed_contract") {
    throw new FieldOpsError(
      "SIGNED_LOCKED",
      "لا يمكن تعديل عقود التوقيع عبر طلب مندوب.",
      423,
    );
  }
  if (merchant.contractState !== "final_contract") {
    throw new FieldOpsError(
      "NOT_LOCKED",
      "طلبات التعديل مخصصة للاتفاقيات النهائية فقط.",
      400,
    );
  }
  if (merchant.editUnlocked) {
    throw new FieldOpsError(
      "ALREADY_UNLOCKED",
      "هذا التاجر مفتوح بالفعل لتعديل معتمد.",
      409,
    );
  }
  if (
    store.editRequests.some(
      (request) =>
        request.merchantId === merchantId &&
        request.requestedBy === actor.id &&
        request.status === "pending",
    )
  ) {
    throw new FieldOpsError(
      "EDIT_PENDING",
      "يوجد طلب تعديل لهذا التاجر قيد المراجعة بالفعل.",
      409,
    );
  }

  const request: EditRequest = {
    id: id("edit"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    requestedBy: actor.id,
    requestedByName: actor.name,
    reason: reason.trim(),
    status: "pending",
    createdAt: isoNow(),
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
  };

  store.editRequests.push(request);
  bump();
  return clone(request);
}

export function decideEditRequest(
  requestId: string,
  decision: "approve" | "reject",
  actor: Actor,
  note: string,
): EditRequest {
  const store = getStore();
  const request = store.editRequests.find(
    (candidate) => candidate.id === requestId,
  );
  if (!request) {
    throw new FieldOpsError("EDIT_NOT_FOUND", "الطلب غير موجود.", 404);
  }
  if (request.status !== "pending") {
    throw new FieldOpsError(
      "EDIT_CLOSED",
      "تمت مراجعة طلب التعديل هذا بالفعل.",
      409,
    );
  }

  request.status = decision === "approve" ? "approved" : "rejected";
  request.reviewedBy = actor.id;
  request.reviewedByName = actor.name;
  request.reviewedAt = isoNow();
  request.reviewNote = note.trim();

  if (decision === "approve") {
    const merchant = store.merchants.find(
      (candidate) => candidate.id === request.merchantId,
    );
    if (merchant) {
      merchant.editUnlocked = true;
      merchant.updatedAt = isoNow();
    }
  }

  bump();
  return clone(request);
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

export function addMerchantDocument(
  merchantId: string,
  input: MerchantDocumentInput,
  actor: Actor,
): Merchant {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  if (
    merchant.contractState !== "final_contract" &&
    merchant.contractState !== "signed_contract"
  ) {
    throw new FieldOpsError(
      "AGREEMENT_REQUIRED",
      "تُفتح المستندات فقط بعد الاتفاق النهائي أو توقيع العقد.",
      423,
    );
  }

  const document: MerchantDocument = {
    id: id("doc"),
    name: input.name.trim(),
    type: input.type,
    url: input.url.trim(),
    uploadedAt: isoNow(),
    uploadedBy: actor.id,
  };
  merchant.documents.push(document);
  merchant.updatedAt = isoNow();
  bump();
  return clone(merchant);
}

export function today(): string {
  return todayIso();
}

export function yesterday(): string {
  return todayIso(-1);
}
