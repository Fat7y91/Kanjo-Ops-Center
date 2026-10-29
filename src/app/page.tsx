import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { firstPermittedPath } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function HomePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  redirect(firstPermittedPath(session.permissions));
}
