import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getServerSession } from "@/lib/auth/server-session";
import { listCities } from "@/lib/field-ops/store";
import {
  assignableLevels,
  filterManageableUsers,
  isGlobalActor,
  toClearanceActor,
} from "@/lib/rbac/hierarchy";
import {
  assertCanCreate,
  RbacDeniedError,
} from "@/lib/rbac/management";
import {
  createUser,
  getRbacRevision,
  listUsers,
} from "@/lib/rbac/users";
import { userCreateSchema } from "@/lib/schemas/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session || !session.permissions.includes("manage_permissions")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = toClearanceActor(session);
  const cities = listCities();
  const scopedCityIds = isGlobalActor(actor)
    ? cities.map((city) => city.id)
    : actor.accessibleCities;

  return NextResponse.json(
    {
      users: filterManageableUsers(actor, listUsers()),
      revision: getRbacRevision(),
      viewerId: session.user.id,
      viewer: {
        clearanceLevel: actor.clearanceLevel,
        globalScope: isGlobalActor(actor),
      },
      assignableLevels: assignableLevels(actor),
      assignableCities: cities.filter((city) =>
        scopedCityIds.includes(city.id),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !session.permissions.includes("manage_permissions")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const input = userCreateSchema.parse(await request.json());

    const knownCities = new Set(listCities().map((city) => city.id));
    const unknownCity = input.accessibleCities.find(
      (cityId) => !knownCities.has(cityId),
    );
    if (unknownCity) {
      throw new RbacDeniedError(
        "UNKNOWN_CITY",
        `مدينة غير معروفة: ${unknownCity}`,
        422,
      );
    }

    assertCanCreate(session, input);

    const user = createUser({
      name: input.name,
      email: input.email,
      title: input.title,
      team: input.team,
      permissions: input.permissions,
      accessibleCities: input.accessibleCities,
      clearanceLevel: input.clearanceLevel,
    });

    return NextResponse.json(
      { user, revision: getRbacRevision() },
      { status: 201 },
    );
  } catch (error) {
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
    if (error instanceof Error && error.name === "PermissionInvariantError") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json(
      { error: "تعذر إنشاء المشغّل." },
      { status: 500 },
    );
  }
}
