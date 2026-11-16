import "server-only";

import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import type { Notification } from "./types";

/**
 * Turns inbox rows into actionable links.
 *
 * Legacy report notifications carry only a V1 task id, so the row has no URL of
 * its own. The visit report for that task names the merchant, and the merchant
 * profile timeline renders every report with an anchor. Resolving both here
 * means a click lands on the exact report instead of the generic inbox.
 *
 * Best effort: a failed lookup leaves the row unlinked rather than failing the
 * inbox. Only same-origin paths are accepted; an external `link` value is
 * discarded so a stored value cannot redirect the operator off the product.
 */

const TASK_CHUNK = 100;
const FALLBACK = "/field-ops";

type TaskTarget = { merchantId: string; reportId: string };

export function isInternalPath(value: string): boolean {
  const path = value.trim();
  return path.startsWith("/") && !path.startsWith("//");
}

async function readTaskTargets(
  taskIds: string[],
): Promise<Map<string, TaskTarget>> {
  const targets = new Map<string, TaskTarget>();
  if (taskIds.length === 0) return targets;

  const client = getSupabaseServerClient();

  for (let index = 0; index < taskIds.length; index += TASK_CHUNK) {
    const chunk = taskIds.slice(index, index + TASK_CHUNK);
    const { data, error } = await client
      .schema("app")
      .from("visit_reports")
      .select("id,task_id,merchant_id,created_at")
      .in("task_id", chunk)
      .order("created_at", { ascending: false })
      .abortSignal(AbortSignal.timeout(6_000));

    if (error) {
      if (isMissingSchemaObject(error)) return targets;
      continue;
    }

    for (const row of (data ?? []) as Array<{
      id: string;
      task_id: string | null;
      merchant_id: string;
    }>) {
      if (!row.task_id || targets.has(row.task_id)) continue;
      targets.set(row.task_id, {
        merchantId: row.merchant_id,
        reportId: row.id,
      });
    }
  }

  return targets;
}

export async function attachDerivedLinks(
  items: Notification[],
): Promise<Notification[]> {
  const taskIds = [
    ...new Set(
      items
        .filter((item) => !isInternalPath(item.link))
        .map((item) => item.taskId)
        .filter((taskId): taskId is string => Boolean(taskId)),
    ),
  ];

  const targets = await readTaskTargets(taskIds);

  return items.map((item) => {
    if (isInternalPath(item.link)) return item;
    const target = item.taskId ? targets.get(item.taskId) : undefined;
    const link = target
      ? `/merchants/${target.merchantId}#report-${target.reportId}`
      : FALLBACK;
    return { ...item, link };
  });
}
