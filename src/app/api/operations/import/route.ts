import { NextResponse } from "next/server";

import { apiError, authorize } from "@/lib/auth/api";
import { OperationsError } from "@/lib/operations/errors";
import { loadImportRoster } from "@/lib/operations/options-repository";
import { importOrders } from "@/lib/operations/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Bulk CSV import of fulfilled orders.
 *
 * The browser parses the file and sends the records as JSON, so the server never
 * trusts a rendered preview: `importOrders` re-validates every row against the
 * live roster before posting. Gated by `import_orders`, distinct from
 * `log_operations`, because a bulk write carries far more risk than one order.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("import_orders");
  if (!session) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "طلب غير صالح.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  const rows =
    typeof body === "object" && body !== null && "rows" in body
      ? (body as { rows?: unknown }).rows
      : undefined;
  const createMissingCouriers =
    typeof body === "object" &&
    body !== null &&
    "createMissingCouriers" in body &&
    (body as { createMissingCouriers?: unknown }).createMissingCouriers === true;
  const courierProfitsRaw =
    typeof body === "object" && body !== null && "courierProfits" in body
      ? (body as { courierProfits?: unknown }).courierProfits
      : undefined;
  const courierProfits: Record<string, number> = {};
  if (
    typeof courierProfitsRaw === "object" &&
    courierProfitsRaw !== null &&
    !Array.isArray(courierProfitsRaw)
  ) {
    for (const [name, value] of Object.entries(courierProfitsRaw)) {
      const numeric = Number(value);
      if (name && Number.isFinite(numeric) && numeric >= 0) {
        courierProfits[name] = numeric;
      }
    }
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "الملف لا يحتوي على صفوف.", code: "EMPTY_FILE" },
      { status: 422 },
    );
  }

  if (rows.length > 5000) {
    return NextResponse.json(
      { error: "الحد الأقصى 5000 صف في الملف الواحد.", code: "TOO_MANY_ROWS" },
      { status: 422 },
    );
  }

  if (
    !rows.every(
      (row) => typeof row === "object" && row !== null && !Array.isArray(row),
    )
  ) {
    return NextResponse.json(
      { error: "صيغة الصفوف غير صالحة.", code: "INVALID_ROWS" },
      { status: 422 },
    );
  }

  try {
    const roster = await loadImportRoster();
    const result = await importOrders(
      session.user.id,
      rows as Record<string, unknown>[],
      roster,
      { createMissingCouriers, courierProfits },
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[operations] import request failed", error);
    if (error instanceof OperationsError) return apiError(error);
    const message =
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : "خطأ غير معروف في قاعدة البيانات.";
    return apiError(
      new OperationsError("IMPORT_FAILED", `تعذر حفظ الطلبات: ${message}`, 500),
    );
  }
}
