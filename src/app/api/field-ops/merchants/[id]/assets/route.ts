import { NextResponse } from "next/server";

import { apiError, authorize } from "@/lib/auth/api";
import { effectiveCityIds } from "@/lib/city-scope-query";
import {
  admitMerchantAsset,
  isMerchantAssetKind,
  MerchantAssetError,
  merchantAssetPath,
} from "@/lib/field-ops/merchant-asset-upload";
import { uploadMerchantAsset, removeMerchantAsset } from "@/lib/field-ops/merchant-asset-storage";
import { getMerchantById } from "@/lib/field-ops/store";
import { updateMerchantRow } from "@/lib/field-ops/merchant-repository";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Merchant logo / cover upload.
 *
 * The image is written to Storage and the resulting public URL is persisted on
 * the merchant row in the same request, so the merchant record stays the single
 * source of truth: there is no "uploaded but unsaved" state for the caller to
 * reconcile. `kind` selects the column; a client can choose nothing else.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("edit_merchants");
  if (!session) return response;
  const { id } = await context.params;

  const merchant = await getMerchantById(id);
  if (!merchant) {
    return NextResponse.json({ error: "التاجر غير موجود." }, { status: 404 });
  }
  // Uploads are a write, so they follow the same city scope as every other
  // merchant mutation: a viewer cannot edit a merchant outside their cities.
  if (!(await effectiveCityIds(session)).includes(merchant.cityId)) {
    return NextResponse.json(
      { error: "التاجر خارج نطاق مدنك." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "طلب غير صالح.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  const kind = form.get("kind");
  const file = form.get("file");
  if (!isMerchantAssetKind(kind) || !(file instanceof File)) {
    return NextResponse.json(
      { error: "نوع الأصل أو الملف غير صالح.", code: "INVALID_REQUEST" },
      { status: 422 },
    );
  }

  try {
    const admission = await admitMerchantAsset(kind, file);
    const path = merchantAssetPath(id, kind, admission.extension);
    const url = await uploadMerchantAsset(
      path,
      new Blob([admission.bytes], { type: admission.mime }),
      admission.mime,
    );

    let updated;
    try {
      updated = await updateMerchantRow(
        id,
        kind === "logo" ? { logoUrl: url } : { coverUrl: url },
      );
    } catch (writeError) {
      // The object is stored but no row references it (a failed update, or a
      // deployment missing `cover_url`). Delete it so the bucket does not
      // accumulate orphans, then surface the original failure.
      await removeMerchantAsset(path);
      throw writeError;
    }

    return NextResponse.json(
      {
        url,
        logoUrl: updated?.logoUrl ?? null,
        coverUrl: updated?.coverUrl ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MerchantAssetError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return apiError(error);
  }
}
