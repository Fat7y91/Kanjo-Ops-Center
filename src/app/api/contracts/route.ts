import { NextResponse } from "next/server";

import { apiError, authorizeAny, readJson } from "@/lib/auth/api";
import { ContractRepositoryError } from "@/lib/contracts/errors";
import {
  findContractDraftMerchant,
  listContractDraftMerchants,
} from "@/lib/contracts/merchant-options";
import { draftContract, listContracts } from "@/lib/contracts/store";
import type { ContractDraftInput } from "@/lib/contracts/types";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { listCities } from "@/lib/field-ops/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const READ_CAPABILITIES = [
  "view_contracts",
  "draft_contract",
  "create_contracts",
  "edit_contract",
  "edit_contracts",
  "sign_contract",
  "sign_contracts",
  "cancel_contract",
  "delete_contracts",
] as const;

/** Register read: contracts plus the merchant/city options a draft form needs. */
export async function GET() {
  const { session, response } = await authorizeAny(READ_CAPABILITIES);
  if (!session) return response;

  try {
    const allowed = new Set(await effectiveCityIds(session));
    const [contracts, merchants, cities] = await Promise.all([
      listContracts(),
      listContractDraftMerchants(session),
      listCities(),
    ]);

    return NextResponse.json(
      {
        contracts: contracts.filter(
          (contract) => !contract.cityId || allowed.has(contract.cityId),
        ),
        merchants,
        cities: cities
          .filter((city) => allowed.has(city.id))
          .map((city) => ({ id: city.id, name: city.name })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const { session, response } = await authorizeAny([
    "draft_contract",
    "create_contracts",
  ]);
  if (!session) return response;

  try {
    const input = (await readJson(request)) as ContractDraftInput;

    // The draft list is scoped and eligibility-filtered; re-derive it here so a
    // request cannot paper a merchant the UI would never have offered.
    const merchant = await findContractDraftMerchant(session, input.merchantId);
    if (!merchant) {
      throw new ContractRepositoryError(
        "MERCHANT_NOT_ELIGIBLE",
        "لا يمكن صياغة عقد لغير تاجر مؤهّل (اتفاق مبدئي/نهائي أو VIP).",
        422,
      );
    }

    const contract = await draftContract(
      {
        ...input,
        merchantName: merchant.name || input.merchantName,
        cityId: merchant.cityId ?? input.cityId,
      },
      session.user.id,
    );
    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
