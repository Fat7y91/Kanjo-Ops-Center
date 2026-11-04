import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerSession } from "@/lib/auth/server-session";
import {
  listCities,
  revokeCityManager,
} from "@/lib/field-ops/store";
import { PERMISSION_KEYS, type Permission } from "@/lib/rbac/permissions";
import {
  assertCanGrant,
  assertCanManage,
  assertCanPatch,
  RbacDeniedError,
} from "@/lib/rbac/management";
import {
  deleteUser,
  getRbacRevision,
  getUserById,
  PermissionInvariantError,
  updateUser,
} from "@/lib/rbac/users";
import { userPatchSchema } from "@/lib/schemas/rbac";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const PERMISSION_SET = new Set<Permission>(PERMISSION_KEYS);

function respondToError(error: unknown) {
  if (error instanceof RbacDeniedError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof PermissionInvariantError) {
    return NextResponse.json(
      { error: error.message },
      { status: 409 },
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
  console.error(error);
  return NextResponse.json(
    { error: "تعذر تحديث المشغّل." },
    { status: 500 },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session || !session.permissions.includes("manage_system_users")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const patch = userPatchSchema.parse(body);

    let nextPermissions: Permission[] | undefined;
    if (patch.permissions !== undefined) {
      nextPermissions = patch.permissions;
    } else if (patch.permission !== undefined && patch.enabled !== undefined) {
      nextPermissions = patch.enabled
        ? Array.from(new Set([...target.permissions, patch.permission]))
        : target.permissions.filter(
            (permission) => permission !== patch.permission,
          );
    }

    if (patch.accessibleCities !== undefined) {
      const knownCities = new Set(
        (await listCities()).map((city) => city.id),
      );
      const unknownCity = patch.accessibleCities.find(
        (cityId) => !knownCities.has(cityId),
      );
      if (unknownCity) {
        throw new RbacDeniedError(
          "UNKNOWN_CITY",
          `مدينة غير معروفة: ${unknownCity}`,
          422,
        );
      }
    }

    const granted = (nextPermissions ?? []).filter(
      (permission) =>
        !target.permissions.includes(permission) &&
        PERMISSION_SET.has(permission),
    );
    assertCanGrant(session, target, granted);

    assertCanPatch(session, target, {
      clearanceLevel: patch.clearanceLevel,
      accessibleCities: patch.accessibleCities,
      permissions:
        patch.permissions !== undefined ? patch.permissions : undefined,
      active: patch.active,
    });

    const updated = await updateUser(id, {
      permissions: nextPermissions,
      clearanceLevel: patch.clearanceLevel,
      accessibleCities: patch.accessibleCities,
      active: patch.active,
    });

    return NextResponse.json({
      user: updated,
      revision: await getRbacRevision(),
    });
  } catch (error) {
    return respondToError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session || !session.permissions.includes("manage_system_users")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    assertCanManage(session, target);

    for (const city of await listCities()) {
      if (city.opsManagers.includes(id)) {
        revokeCityManager(city.id, id);
      }
    }

    const removed = await deleteUser(id);
    return NextResponse.json({
      user: removed,
      revision: await getRbacRevision(),
    });
  } catch (error) {
    return respondToError(error);
  }
}
