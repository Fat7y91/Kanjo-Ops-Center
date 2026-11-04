import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { normalizeSearchText } from "@/lib/search/normalize";

import type {
  CatalogProduct,
  CatalogProductState,
  CatalogProductType,
  CatalogVariantSelection,
} from "./types";

/**
 * Tier 4 repository for `app.catalog_products`.
 *
 * This is the only module that knows the product column names. The catalog is a
 * strict SQL store: there is no seed fallback, so a deployment without a
 * database shows an empty catalog instead of invented products, and a failed
 * write is surfaced rather than acknowledged.
 *
 * Created and widened by `20261106000000_merchant_catalog_ssot.sql`.
 */

const COLUMNS = [
  "id",
  "merchant_id",
  "name",
  "normalized_name",
  "description",
  "vendor_type_id",
  "category_key",
  "product_type",
  "sku",
  "barcode",
  "image_data_url",
  "attributes",
  "price_minor",
  "state",
  "review_note",
  "entered_by_name",
  "client_product_id",
  "created_by",
  "created_at",
  "updated_at",
].join(",");

type ProductRow = {
  id: string;
  merchant_id: string;
  name: string;
  normalized_name: string;
  description: string;
  vendor_type_id: number | null;
  category_key: string | null;
  product_type: CatalogProductType;
  sku: string | null;
  barcode: string | null;
  image_data_url: string | null;
  attributes: CatalogVariantSelection[] | null;
  price_minor: number | string;
  state: CatalogProductState;
  review_note: string;
  entered_by_name: string | null;
  client_product_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CatalogProductPatch = Partial<{
  imageDataUrl: string | null;
  state: CatalogProductState;
  reviewNote: string;
}>;

export class CatalogRepositoryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CatalogRepositoryError";
    this.code = code;
    this.status = status;
  }
}

export function isCatalogDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

function toProduct(row: ProductRow, merchantName: string): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    merchantId: row.merchant_id,
    merchantName,
    vendorTypeId: row.vendor_type_id == null ? null : Number(row.vendor_type_id),
    categoryKey: row.category_key,
    productType: row.product_type,
    sku: row.sku ?? "",
    barcode: row.barcode ?? "",
    imageDataUrl: row.image_data_url,
    attributes: Array.isArray(row.attributes) ? row.attributes : [],
    price: Number(row.price_minor) / 100,
    state: row.state,
    reviewNote: row.review_note,
    enteredById: row.created_by,
    enteredByName: row.entered_by_name,
    clientProductId: row.client_product_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loggedByValue(actorId: string | null): string | null {
  return actorId && UUID.test(actorId) ? actorId : null;
}

/** True when the error is a unique violation on the given index name. */
function violates(error: unknown, index: string): boolean {
  if (!isUniqueViolation(error)) return false;
  const message = (error as { message?: unknown }).message;
  const details = (error as { details?: unknown }).details;
  const text = `${typeof message === "string" ? message : ""} ${
    typeof details === "string" ? details : ""
  }`;
  return text.includes(index);
}

/**
 * Products plus the merchant name the card renders.
 *
 * Merchant names live on `app.merchants`, so the read joins once instead of
 * issuing a query per product.
 */
export async function listProductRows(
  merchantId?: string,
): Promise<CatalogProduct[]> {
  if (!isCatalogDatabaseConfigured()) return [];

  const client = getSupabaseServerClient();
  let query = client
    .schema("app")
    .from("catalog_products")
    .select(`${COLUMNS},merchants(name)`)
    .order("name", { ascending: true });
  if (merchantId) query = query.eq("merchant_id", merchantId);

  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaObject(error)) return [];
    throw error;
  }

  return ((data ?? []) as unknown as Array<
    ProductRow & { merchants: { name: string } | { name: string }[] | null }
  >).map((row) => {
    const embed = Array.isArray(row.merchants) ? row.merchants[0] : row.merchants;
    return toProduct(row, embed?.name ?? titleCase(row.merchant_id));
  });
}

export async function getProductRow(
  id: string,
): Promise<CatalogProduct | null> {
  if (!isCatalogDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("catalog_products")
    .select(`${COLUMNS},merchants(name)`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  if (!data) return null;
  const row = data as unknown as ProductRow & {
    merchants: { name: string } | { name: string }[] | null;
  };
  const embed = Array.isArray(row.merchants) ? row.merchants[0] : row.merchants;
  return toProduct(row, embed?.name ?? titleCase(row.merchant_id));
}

/** The product created from a given offline draft id, when it exists. */
export async function findProductByClientId(
  clientProductId: string,
): Promise<CatalogProduct | null> {
  if (!isCatalogDatabaseConfigured()) return null;
  return firstMatch("client_product_id", clientProductId);
}

export async function findProductBySku(
  sku: string,
): Promise<CatalogProduct | null> {
  if (!isCatalogDatabaseConfigured()) return null;
  return firstMatch("sku", sku);
}

export async function findProductByBarcode(
  barcode: string,
): Promise<CatalogProduct | null> {
  if (!isCatalogDatabaseConfigured()) return null;
  return firstMatch("barcode", barcode);
}

export async function findProductByMerchantName(
  merchantId: string,
  normalizedName: string,
): Promise<CatalogProduct | null> {
  if (!isCatalogDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("catalog_products")
    .select(COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  return data ? toProduct(data as unknown as ProductRow, "") : null;
}

async function firstMatch(
  column: "client_product_id" | "sku" | "barcode",
  value: string,
): Promise<CatalogProduct | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("catalog_products")
    .select(`${COLUMNS},merchants(name)`)
    .eq(column, value)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    throw error;
  }
  if (!data) return null;
  const row = data as unknown as ProductRow & {
    merchants: { name: string } | { name: string }[] | null;
  };
  const embed = Array.isArray(row.merchants) ? row.merchants[0] : row.merchants;
  return toProduct(row, embed?.name ?? titleCase(row.merchant_id));
}

export async function insertProduct(
  product: CatalogProduct,
): Promise<CatalogProduct> {
  if (!isCatalogDatabaseConfigured()) {
    throw new CatalogRepositoryError(
      "CATALOG_UNAVAILABLE",
      "قاعدة بيانات الكتالوج غير متصلة.",
      503,
    );
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("catalog_products")
    .insert({
      id: product.id,
      merchant_id: product.merchantId,
      name: product.name,
      normalized_name: normalizeSearchText(product.name),
      description: product.description,
      vendor_type_id: product.vendorTypeId,
      category_key: product.categoryKey,
      product_type: product.productType,
      sku: product.sku || null,
      barcode: product.barcode || null,
      image_data_url: product.imageDataUrl,
      attributes: product.attributes,
      price_minor: Math.round(product.price * 100),
      state: product.state,
      review_note: product.reviewNote,
      entered_by_name: product.enteredByName,
      client_product_id: product.clientProductId,
      created_by: loggedByValue(product.enteredById),
      created_at: product.createdAt,
      updated_at: product.updatedAt,
    })
    .select(`${COLUMNS},merchants(name)`)
    .single();

  if (error) {
    if (violates(error, "catalog_products_client_id_key")) {
      throw new CatalogRepositoryError(
        "PRODUCT_ALREADY_SYNCED",
        "تمت مزامنة هذه المسودة بالفعل.",
        409,
      );
    }
    if (violates(error, "catalog_products_merchant_name_key")) {
      throw new CatalogRepositoryError(
        "PRODUCT_EXISTS",
        "يوجد منتج بهذا الاسم لهذا التاجر بالفعل.",
        409,
      );
    }
    if (violates(error, "catalog_products_barcode_key")) {
      throw new CatalogRepositoryError(
        "BARCODE_EXISTS",
        "الباركود مستخدم لمنتج آخر بالفعل.",
        409,
      );
    }
    if (violates(error, "catalog_products_sku_key")) {
      throw new CatalogRepositoryError(
        "SKU_EXISTS",
        "رمز SKU مستخدم بالفعل.",
        409,
      );
    }
    throw error;
  }

  const row = data as unknown as ProductRow & {
    merchants: { name: string } | { name: string }[] | null;
  };
  const embed = Array.isArray(row.merchants) ? row.merchants[0] : row.merchants;
  return toProduct(row, embed?.name ?? product.name);
}

export async function updateProductRow(
  id: string,
  patch: CatalogProductPatch,
): Promise<CatalogProduct | null> {
  if (!isCatalogDatabaseConfigured()) {
    throw new CatalogRepositoryError(
      "CATALOG_UNAVAILABLE",
      "قاعدة بيانات الكتالوج غير متصلة.",
      503,
    );
  }

  const row: Record<string, unknown> = {};
  if (patch.imageDataUrl !== undefined) row.image_data_url = patch.imageDataUrl;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.reviewNote !== undefined) row.review_note = patch.reviewNote;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("catalog_products")
    .update(row)
    .eq("id", id)
    .select(`${COLUMNS},merchants(name)`)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const record = data as unknown as ProductRow & {
    merchants: { name: string } | { name: string }[] | null;
  };
  const embed = Array.isArray(record.merchants)
    ? record.merchants[0]
    : record.merchants;
  return toProduct(record, embed?.name ?? titleCase(record.merchant_id));
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
