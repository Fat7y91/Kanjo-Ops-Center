import type { FieldTask, Merchant } from "@/lib/field-ops/types";
import type { TaskAssignInput } from "@/lib/schemas/field-ops";

import {
  FieldOpsError,
  bump,
  clone,
  getStore,
  id,
  isoNow,
  type Actor,
} from "./core";

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
