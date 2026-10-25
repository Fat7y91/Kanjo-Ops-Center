import { NextResponse } from "next/server";

import { apiError, authorize, readJson } from "@/lib/auth/api";
import { analyzePolygon } from "@/lib/geo/intelligence";
import { geoIntelligenceSchema } from "@/lib/schemas/geo-intelligence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { session, response } = await authorize("view_city_analytics");
  if (!session) return response;

  try {
    const raw = await readJson(request);
    const candidate: unknown =
      raw && typeof raw === "object" && (raw as { type?: unknown }).type === "Polygon"
        ? { polygon: raw }
        : raw;
    const input = geoIntelligenceSchema.parse(candidate);
    const analysis = analyzePolygon(input.polygon, input.datasetCityId);
    return NextResponse.json({ analysis });
  } catch (error) {
    return apiError(error);
  }
}
