import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/server-session";
import {
  getRbacRevision,
  listUsers,
} from "@/lib/rbac/users";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session || !session.permissions.includes("manage_permissions")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    {
      users: listUsers(),
      revision: getRbacRevision(),
      viewerId: session.user.id,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
