import { Suspense } from "react";

import { UserDetailSection } from "@/components/admin/user-detail-section";
import { requirePermission } from "@/lib/auth/guard";
import { UserDetailLoading } from "@/components/admin/user-detail-loading";

export const dynamic = "force-dynamic";

type UserPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * Operator detail route.
 *
 * Authorization runs first (cheap), then the body streams behind Suspense so the
 * navigation commits immediately and the capability grid fills in after.
 */
export default async function UserDetailPage({ params }: UserPageProps) {
  const session = await requirePermission("manage_permissions");
  const { id } = await params;

  return (
    <Suspense fallback={<UserDetailLoading />}>
      <UserDetailSection id={id} session={session} />
    </Suspense>
  );
}
