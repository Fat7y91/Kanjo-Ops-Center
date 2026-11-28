import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { apiError, authorizeMinClearance, readJson } from "@/lib/auth/api";
import {
  CommissionRatesError,
  loadActiveCommissionRate,
  saveCommissionRate,
} from "@/lib/commissions/rates";
import { listCities } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * City commission fee schedule (`app.commission_rates`).
 *
 * The surface is gated by clearance rank, not by a capability key: the SQL
 * policies require `app.has_min_clearance(4)`, and the guard mirrors that.
 * Cities live in Firestore, so a city id that does not exist there is refused
 * before anything reaches the database.
 */
const FINANCE_CLEARANCE = 4;

export async function GET(request: Request) {
  const { session, response } = await authorizeMinClearance(FINANCE_CLEARANCE);
  if (!session) return response;

  const cityId =
    new URL(request.url).searchParams.get("cityId")?.trim() || null;

  try {
    const { active, rows } = await loadActiveCommissionRate(cityId);
    return NextResponse.json(
      {
        cityId,
        active,
        rows,
        cities: (await listCities()).map((city) => ({
          id: city.id,
          name: city.name,
          governorate: city.governorate,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CommissionRatesError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  const { session, response } = await authorizeMinClearance(FINANCE_CLEARANCE);
  if (!session) return response;

  try {
    const body = (await readJson(request)) as { cityId?: unknown };
    if (typeof body.cityId === "string" && body.cityId.trim() !== "") {
      const cityId = body.cityId.trim();
      if (!(await listCities()).some((city) => city.id === cityId)) {
        return NextResponse.json(
          { error: "مدينة غير معروفة.", code: "UNKNOWN_CITY" },
          { status: 422 },
        );
      }
    }

    const { rate, created } = await saveCommissionRate(session, body);
    return NextResponse.json({ rate, created }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof CommissionRatesError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof ZodError) {
      const first = error.errors[0];
      return NextResponse.json(
        {
          error: first ? first.message : "فشل التحقق من البيانات.",
          code: "VALIDATION",
          path: first?.path,
        },
        { status: 422 },
      );
    }
    return apiError(error);
  }
}
