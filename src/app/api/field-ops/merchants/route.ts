import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { loadMerchantStates } from "@/lib/field-ops/state-source";
import { createMerchant, listCities, listMerchants } from "@/lib/field-ops/store";
import { merchantCreateSchema } from "@/lib/schemas/field-ops";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }
  if (
    !session.permissions.includes("view_merchants") &&
    !session.permissions.includes("assign_tasks")
  ) {
    return NextResponse.json(
      { error: "لا تملك هذه الصلاحية." },
      { status: 403 },
    );
  }

  const allowed = new Set(effectiveCityIds(session));
  const cityMap = new Map(listCities().map((city) => [city.id, city]));

  const scoped = (await listMerchants()).filter((merchant) =>
    allowed.has(merchant.cityId),
  );
  // The picker badge must show the resolved agreement state, which is what the
  // visit form gates on — not the raw stored column.
  const states = await loadMerchantStates(scoped);

  const merchants = scoped.map((merchant) => {
    const city = cityMap.get(merchant.cityId);
    return {
      id: merchant.id,
      name: merchant.name,
      vendorTypeId: merchant.vendorTypeId,
      vendorType: merchant.vendorType,
      cityId: merchant.cityId,
      cityName: city?.name ?? merchant.cityId,
      cityStage: city?.stage ?? "preparation",
      team: merchant.team,
      contractState: states.get(merchant.id)?.state ?? merchant.contractState,
      targetCommission: merchant.targetCommission,
    };
  });

  return NextResponse.json(
    { merchants },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorize("add_merchant");
  if (!session) return response;

  try {
    const input = merchantCreateSchema.parse(await readJson(request));

    if (
      !effectiveCityIds(session).includes(input.cityId) ||
      !listCities().some((city) => city.id === input.cityId)
    ) {
      return NextResponse.json(
        { error: "هذه المدينة خارج نطاق مدنك.", code: "CITY_OUT_OF_SCOPE" },
        { status: 403 },
      );
    }

    const merchant = await createMerchant(input, actorFromSession(session));
    return NextResponse.json({ merchant }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
