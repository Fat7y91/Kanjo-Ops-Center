import { NextResponse } from "next/server";

import { actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { visitReportSchema } from "@/lib/schemas/field-ops";
import {
  createVisitReport,
  FieldOpsError,
  getMerchantById,
  visitCountFor,
} from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";

type QueuedVisit = {
  merchantId?: unknown;
  payload?: unknown;
};

type SyncResult = {
  clientVisitId: string | null;
  merchantId: string;
  status: "synced" | "duplicate" | "failed";
  reportId?: string;
  error?: string;
  code?: string;
};

/**
 * Offline sync endpoint.
 *
 * The client keeps a durable queue of completed visits captured with no
 * connectivity. On reconnect it POSTs the whole batch here; each entry is
 * applied independently so one bad record cannot block the rest, and
 * `clientVisitId` makes retries idempotent.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("view_field_ops");
  if (!session) return response;

  const body = (await readJson(request)) as { visits?: QueuedVisit[] };
  const visits = Array.isArray(body.visits) ? body.visits.slice(0, 50) : [];

  if (visits.length === 0) {
    return NextResponse.json(
      { error: "لا توجد زيارات للمزامنة.", code: "EMPTY_BATCH" },
      { status: 422 },
    );
  }

  const actor = actorFromSession(session);
  const canManageTasks = session.permissions.includes("manage_tasks");
  const canManageState = session.permissions.includes("manage_merchant_state");
  const cityScope = new Set(effectiveCityIds(session));

  const results: SyncResult[] = [];

  for (const entry of visits) {
    const merchantId = typeof entry.merchantId === "string" ? entry.merchantId : "";
    const parsed = visitReportSchema.safeParse(entry.payload);
    const clientVisitId =
      (parsed.success && parsed.data.clientVisitId) || null;

    if (!parsed.success) {
      results.push({
        clientVisitId,
        merchantId,
        status: "failed",
        code: "VALIDATION",
        error:
          parsed.error.errors[0]?.message ?? "بيانات الزيارة غير صالحة.",
      });
      continue;
    }

    const merchant = getMerchantById(merchantId);
    if (!merchant) {
      results.push({
        clientVisitId,
        merchantId,
        status: "failed",
        code: "MERCHANT_NOT_FOUND",
        error: "التاجر غير موجود.",
      });
      continue;
    }

    if (!canManageTasks && !cityScope.has(merchant.cityId)) {
      results.push({
        clientVisitId,
        merchantId,
        status: "failed",
        code: "OUTSIDE_CITY_SCOPE",
        error: "هذا التاجر خارج نطاق المدن المتاح لك.",
      });
      continue;
    }

    const priorVisits = visitCountFor(merchantId);
    if (parsed.data.outcome === "signed_contract") {
      results.push({
        clientVisitId,
        merchantId,
        status: "failed",
        code: "SIGNED_MANAGER_ONLY",
        error: "اعتماد توقيع العقد متاح فقط من كارت التاجر لمديري الحالات.",
      });
      continue;
    }
    if (
      priorVisits === 0 &&
      parsed.data.outcome === "final_contract" &&
      !canManageState
    ) {
      results.push({
        clientVisitId,
        merchantId,
        status: "failed",
        code: "FIRST_VISIT_GATE",
        error:
          "خيار «اتفاق نهائي» متاح فقط للتجار الذين لديهم زيارة سابقة.",
      });
      continue;
    }

    try {
      const created = createVisitReport(merchantId, parsed.data, actor, {
        canManageState,
      });
      results.push({
        clientVisitId,
        merchantId,
        status: created.duplicate ? "duplicate" : "synced",
        reportId: created.report.id,
      });
    } catch (error) {
      if (error instanceof FieldOpsError) {
        const duplicate =
          error.code === "DUPLICATE_VISIT" ||
          /already/i.test(error.message);
        results.push({
          clientVisitId,
          merchantId,
          status: duplicate ? "duplicate" : "failed",
          code: error.code,
          error: error.message,
        });
      } else {
        results.push({
          clientVisitId,
          merchantId,
          status: "failed",
          code: "UNKNOWN",
          error: error instanceof Error ? error.message : "فشلت المزامنة.",
        });
      }
    }
  }

  const failed = results.filter((result) => result.status === "failed");

  if (failed.length === results.length) {
    return NextResponse.json(
      { error: failed[0]?.error ?? "فشلت كل الزيارات.", results },
      { status: 422 },
    );
  }

  return NextResponse.json(
    {
      synced: results.filter((result) => result.status === "synced").length,
      failed: failed.length,
      results,
    },
    { status: 200 },
  );
}
