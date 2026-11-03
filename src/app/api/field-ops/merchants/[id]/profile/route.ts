import { NextResponse } from "next/server";

import { apiError, actorFromSession, authorize, readJson } from "@/lib/auth/api";
import { getMerchantById, FieldOpsError } from "@/lib/field-ops/store";
import {
  getMerchantV1Profile,
  isMerchantProfilesDatabaseConfigured,
  saveMerchantV1Profile,
  type MerchantV1Patch,
} from "@/lib/field-ops/merchant-profile-repository";
import { merchantV1ProfileSchema } from "@/lib/schemas/field-ops";
import type { Permission } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Which capability guards which patch key.
 *
 * A request may carry several fields, so every supplied field is checked
 * against its own permission; a caller who may edit socials but not publish
 * gets a 403 rather than a partial write.
 */
const FIELD_PERMISSION: Record<keyof MerchantV1Patch, Permission> = {
  actualAddress: "edit_merchant_socials",
  facebookUrl: "edit_merchant_socials",
  instagramUrl: "edit_merchant_socials",
  driveFolderUrl: "export_merchant_data",
  appPublished: "toggle_app_publish",
  vipMenu: "manage_vip_menu",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_merchants");
  if (!session) return response;
  const { id } = await context.params;

  try {
    if (!getMerchantById(id)) {
      throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
    }
    const profile = await getMerchantV1Profile(id);
    return NextResponse.json(
      { profile },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { session, response } = await authorize("view_merchants");
  if (!session) return response;
  const { id } = await context.params;

  try {
    if (!getMerchantById(id)) {
      throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
    }
    if (!isMerchantProfilesDatabaseConfigured()) {
      throw new FieldOpsError(
        "STORE_UNAVAILABLE",
        "قاعدة البيانات غير متصلة.",
        503,
      );
    }

    const input = merchantV1ProfileSchema.parse(await readJson(request));
    const supplied = Object.entries(input).filter(
      ([, value]) => value !== undefined,
    ) as [keyof MerchantV1Patch, unknown][];

    if (supplied.length === 0) {
      throw new FieldOpsError("EMPTY_PATCH", "لا توجد حقول للتحديث.", 422);
    }

    for (const [field] of supplied) {
      if (!session.permissions.includes(FIELD_PERMISSION[field])) {
        throw new FieldOpsError(
          "FORBIDDEN_FIELD",
          "لا تملك صلاحية تعديل أحد الحقول المطلوبة.",
          403,
        );
      }
    }

    const patch = Object.fromEntries(supplied) as MerchantV1Patch;
    const actor = actorFromSession(session);
    const profile = await saveMerchantV1Profile(id, patch, actor.id);
    return NextResponse.json({ profile });
  } catch (error) {
    return apiError(error);
  }
}
