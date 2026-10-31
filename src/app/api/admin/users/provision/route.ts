import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { apiError, readJson } from "@/lib/auth/api";
import { getServerSession } from "@/lib/auth/server-session";
import {
  createUserAccount,
  ProvisioningError,
} from "@/lib/rbac/services/provisioning-service";
import { RbacDeniedError } from "@/lib/rbac/management";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Top-down account provisioning. Public signup is disabled, so this is the
 * only way an operator account can come into existence.
 *
 * Guarded by `manage_permissions`; `createUserAccount` additionally enforces
 * that the caller may assign the requested level (executives up to their own
 * rank, everyone else strictly below) and can only grant a subset of their own
 * permissions and cities.
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }
  if (!session.permissions.includes("manage_permissions")) {
    return NextResponse.json({ error: "لا تملك هذه الصلاحية." }, { status: 403 });
  }

  try {
    const account = await createUserAccount(session, await readJson(request));
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof ProvisioningError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof RbacDeniedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof ZodError) {
      const first = error.errors[0];
      return NextResponse.json(
        {
          error: first
            ? `${first.path.join(".") || "input"}: ${first.message}`
            : "فشل التحقق من البيانات.",
          code: "VALIDATION",
        },
        { status: 422 },
      );
    }
    return apiError(error);
  }
}
