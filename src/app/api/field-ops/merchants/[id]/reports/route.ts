import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { persistVisitReport } from "@/lib/field-ops/reports-repository";
import { visitReportSchema } from "@/lib/schemas/visit";
import {
  createVisitReport,
  FieldOpsError,
  getMerchantById,
  visitCountFor,
} from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_all_teams_visits");
  if (!session) return response;
  const { id } = await context.params;

  try {
    const merchant = getMerchantById(id);
    if (!merchant) {
      throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
    }

    /*
     * Reps may now open a visit for ANY merchant in their accessible cities,
     * not only ones already assigned to their team or on today's board.
     * Cross-team ownership still requires the transfer-request workflow, but
     * it must not block an unplanned, offline-capable visit.
     */
    const canManageTasks = session.permissions.includes("assign_tasks");
    const inScope = effectiveCityIds(session).includes(merchant.cityId);
    if (!canManageTasks && !inScope) {
      throw new FieldOpsError(
        "OUTSIDE_CITY_SCOPE",
        "هذا التاجر خارج نطاق المدن المتاح لك.",
        403,
      );
    }

    const input = visitReportSchema.parse(await readJson(request));

    // Signing is never a rep outcome: it is an admin action on the CRM card.
    if (input.outcome === "signed_contract") {
      throw new FieldOpsError(
        "SIGNED_MANAGER_ONLY",
        "اعتماد توقيع العقد متاح فقط من كارت التاجر لمديري الحالات.",
        403,
      );
    }

    // Server-side enforcement of the conditional state machine, independent
    // of whatever the offline client cached.
    if (
      (await visitCountFor(id)) === 0 &&
      input.outcome === "final_contract" &&
      !session.permissions.includes("edit_contract")
    ) {
      throw new FieldOpsError(
        "FIRST_VISIT_GATE",
        "خيار «اتفاق نهائي» متاح فقط للتجار الذين لديهم زيارة سابقة.",
        422,
      );
    }

    const actor = actorFromSession(session);
    const result = await createVisitReport(id, input, actor, {
      canManageState: session.permissions.includes("edit_contract"),
    });

    if (!result.duplicate) {
      await persistVisitReport(result.report, actor.id);
    }

    return NextResponse.json(
      { ...result, visitCount: await visitCountFor(id) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_all_teams_visits");
  if (!session) return response;
  const { id } = await context.params;

  const merchant = getMerchantById(id);
  if (!merchant) {
    return NextResponse.json(
      { error: "التاجر غير موجود.", code: "MERCHANT_NOT_FOUND" },
      { status: 404 },
    );
  }

  const visitCount = await visitCountFor(id);

  return NextResponse.json(
    {
      merchantId: id,
      visitCount,
      canUseAdvancedOutcomes: visitCount > 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
