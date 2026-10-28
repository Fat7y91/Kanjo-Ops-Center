import { NextResponse } from "next/server";

import {
  apiError,
  authorizeAny,
  readJson,
} from "@/lib/auth/api";
import { catalogRevision, createProduct, listProducts } from "@/lib/catalog/store";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { getMerchantById } from "@/lib/field-ops/store";
import { productCreateSchema } from "@/lib/schemas/catalog";

export const dynamic = "force-dynamic";

const PRODUCT_CREATE_CAPABILITIES = [
  "create_products",
  "manage_catalog",
] as const;

export async function GET() {
  const { session, response } = await authorizeAny(["view_catalog"]);
  if (!session) return response;

  // Same city scope as the page: the client reload must never widen visibility.
  const allowed = new Set(effectiveCityIds(session));
  const products = listProducts().filter((product) => {
    const merchant = getMerchantById(product.merchantId);
    return merchant ? allowed.has(merchant.cityId) : false;
  });

  return NextResponse.json(
    { products, revision: catalogRevision() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { session, response } = await authorizeAny([
    ...PRODUCT_CREATE_CAPABILITIES,
  ]);
  if (!session) return response;

  try {
    const input = productCreateSchema.parse(await readJson(request));
    const product = createProduct(input);
    return NextResponse.json(
      { product, revision: catalogRevision() },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
