import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/server-session";
import { isPermission } from "@/lib/rbac/permissions";
import {
  getRbacRevision,
  getUserById,
  normalizePermissions,
  PermissionInvariantError,
  updateUserPermissions,
} from "@/lib/rbac/users";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchBody = {
  permission?: unknown;
  enabled?: unknown;
  permissions?: unknown;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession();
  if (!session || !session.permissions.includes("manage_permissions")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const user = getUserById(id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let nextPermissions = user.permissions;

  if (Array.isArray(body.permissions)) {
    nextPermissions = normalizePermissions(body.permissions);
  } else {
    if (!isPermission(body.permission)) {
      return NextResponse.json(
        { error: "Unknown capability" },
        { status: 400 },
      );
    }
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 },
      );
    }

    nextPermissions = body.enabled
      ? Array.from(new Set([...user.permissions, body.permission]))
      : user.permissions.filter(
          (permission) => permission !== body.permission,
        );
  }

  try {
    const updated = updateUserPermissions(id, nextPermissions);
    return NextResponse.json({
      user: updated,
      revision: getRbacRevision(),
    });
  } catch (error) {
    if (error instanceof PermissionInvariantError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Unable to update permissions" },
      { status: 500 },
    );
  }
}
