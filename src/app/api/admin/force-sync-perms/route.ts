import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type ExecutiveRow = {
  id: string;
  auth_revision: number;
};

export async function GET() {
  try {
    const client = getSupabaseServerClient();

    const catalogue = PERMISSIONS.map((permission, index) => ({
      key: permission.key,
      label: permission.label,
      description: permission.description,
      group_key: permission.group,
      sort_order: index + 1,
    }));

    const { error: catalogueError } = await client
      .schema("app")
      .from("permissions")
      .upsert(catalogue, { onConflict: "key" });
    if (catalogueError) throw catalogueError;

    const { data, error: usersError } = await client
      .schema("app")
      .from("users")
      .select("id,auth_revision")
      .eq("clearance_level", 4);
    if (usersError) throw usersError;

    const executives = (data ?? []) as ExecutiveRow[];

    const grants = executives.flatMap((user) =>
      catalogue.map((permission) => ({
        user_id: user.id,
        permission_key: permission.key,
      })),
    );

    if (grants.length > 0) {
      const { error: grantError } = await client
        .schema("app")
        .from("user_permissions")
        .upsert(grants, {
          onConflict: "user_id,permission_key",
          ignoreDuplicates: true,
        });
      if (grantError) throw grantError;
    }

    const revisions: number[] = [];
    for (const user of executives) {
      const nextRevision = user.auth_revision + 1;
      const { error: revisionError } = await client
        .schema("app")
        .from("users")
        .update({ auth_revision: nextRevision })
        .eq("id", user.id);
      if (revisionError) throw revisionError;
      revisions.push(nextRevision);
    }

    return NextResponse.json({
      ok: true,
      permissions: catalogue.length,
      executives: executives.length,
      grants: grants.length,
      revisions,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Permission sync failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
