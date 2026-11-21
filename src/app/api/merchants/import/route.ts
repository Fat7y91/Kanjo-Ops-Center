import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { importMerchants } from "@/lib/merchants/import-service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Bulk CSV import of merchants.
 *
 * The browser parses and previews the file with the same pure mapper the server
 * uses, so nothing here trusts a rendered preview: every row is re-validated
 * against the live catalogue and city list before it is written. Gated by
 * `import_merchants`, distinct from `add_merchant`, because a bulk write carries
 * more risk than one record.
 */
export async function POST(request: Request) {
  const { session, response } = await authorize("import_merchants");
  if (!session) return response;

  let body: unknown;
  try {
    body = await readJson(request);
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
  const defaultCityId =
    typeof body === "object" && body !== null && "defaultCityId" in body
      ? String((body as { defaultCityId?: unknown }).defaultCityId ?? "")
      : "";

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
    const result = await importMerchants(
      rows as Record<string, unknown>[],
      session.user.id,
      defaultCityId,
      await effectiveCityIds(session),
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
