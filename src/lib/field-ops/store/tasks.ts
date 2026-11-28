import type { FieldTask, Merchant } from "@/lib/field-ops/types";
import type { TaskAssignInput } from "@/lib/schemas/field-ops";

import { FieldOpsError, id, isoNow, type Actor } from "./core";
import { getCityById } from "./cities";
import { requireMerchant } from "./merchants";
import { updateMerchantRow } from "../merchant-repository";
import {
  insertTask,
  listTaskRows,
  isFieldTasksDatabaseConfigured,
} from "../task-repository";

/**
 * Scheduled merchant visits, backed by `app.field_tasks`.
 *
 * The board used to read a process-local array: two workers disagreed about
 * today's schedule and a restart forgot it. Reads now come from the table and
 * writes are rejected loudly when no database is attached, instead of being
 * acknowledged and dropped.
 */

function requireDatabase(): void {
  if (!isFieldTasksDatabaseConfigured()) {
    throw new FieldOpsError(
      "TASKS_UNAVAILABLE",
      "قاعدة بيانات المهام غير متصلة.",
      503,
    );
  }
}

export async function listTasks(): Promise<FieldTask[]> {
  const tasks = await listTaskRows();
  return tasks.sort((left, right) =>
    `${left.visitDate}-${left.merchantName}`.localeCompare(
      `${right.visitDate}-${right.merchantName}`,
      "ar",
    ),
  );
}

export async function tasksForViewer(input: {
  team: string;
  canManageTasks: boolean;
  date: string;
}): Promise<FieldTask[]> {
  const tasks = await listTasks();
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

export async function assignMerchantTask(
  input: TaskAssignInput,
  actor: Actor,
): Promise<{ task: FieldTask; merchant: Merchant }> {
  requireDatabase();
  const merchant = await requireMerchant(input.merchantId);

  const city = await getCityById(merchant.cityId);
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

  let assigned = merchant;
  if (!merchant.team) {
    const updated = await updateMerchantRow(merchant.id, { team: input.team });
    if (updated) assigned = updated;
  }

  const task: FieldTask = {
    id: id("task"),
    merchantId: assigned.id,
    merchantName: assigned.name,
    team: input.team,
    cityId: assigned.cityId,
    visitDate: input.visitDate,
    targetCommission: assigned.targetCommission,
    strategicNotes: assigned.strategicNotes,
    instructions: input.instructions.trim(),
    status: "scheduled",
    createdBy: actor.id,
    createdByName: actor.name,
    createdAt: isoNow(),
  };

  const saved = await insertTask(task);
  return { task: saved, merchant: assigned };
}
