import { NextResponse } from "next/server";

import {
  apiError,
  authorizeAny,
  readJson,
} from "@/lib/auth/api";
import { catalogRevision, createProduct, listProducts } from "@/lib/catalog/store";
import { effectiveCityIds } from "@/lib/city-scope-query";
import { listMerchants } from "@/lib/field-ops/store";
import { permissionsForModule } from "@/lib/rbac/modules";
import { productCreateSchema } from "@/lib/schemas/catalog";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const PRODUCT_CREATE_CAPABILITIES = [
  "add_catalog",
  "edit_catalog",
] as const;

/** Mirrors the `/catalog` nav module so any screen that opens can load rows. */
const CATALOG_READ_CAPABILITIES = permissionsForModule("/catalog");

export async function GET() {
  const { session, response } = await authorizeAny(CATALOG_READ_CAPABILITIES);
  if (!session) return response;

  // Same city scope as the page: the client reload must never widen visibility.
  const allowed = new Set(effectiveCityIds(session));
  const merchantCity = new Map(
    (await listMerchants()).map((merchant) => [merchant.id, merchant.cityId]),
  );
  const products = (await listProducts()).filter((product) => {
    const merchant = merchantCity.get(product.merchantId);
    return merchant ? allowed.has(merchant) : false;
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
    const product = await createProduct(input, {
      id: session.user.id,
      name: session.user.name,
    });
    return NextResponse.json(
      { product, revision: catalogRevision() },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
