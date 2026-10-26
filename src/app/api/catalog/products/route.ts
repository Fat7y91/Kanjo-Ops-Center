import { NextResponse } from "next/server";

import {
  apiError,
  authorizeAny,
  readJson,
} from "@/lib/auth/api";
import { catalogRevision, createProduct, listProducts } from "@/lib/catalog/store";
import { productCreateSchema } from "@/lib/schemas/catalog";

export const dynamic = "force-dynamic";

const PRODUCT_CREATE_CAPABILITIES = [
  "create_products",
  "manage_catalog",
] as const;

export async function GET() {
  const { session, response } = await authorizeAny(["view_catalog"]);
  if (!session) return response;

  return NextResponse.json(
    { products: listProducts(), revision: catalogRevision() },
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
