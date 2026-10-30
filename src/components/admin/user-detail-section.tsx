import { notFound } from "next/navigation";

import { UserDetail } from "@/components/admin/user-detail";
import { PageHeader } from "@/components/ui/page-header";
import {
  canManageUser,
  clearanceLabel,
  toClearanceActor,
} from "@/lib/rbac/hierarchy";
import { PERMISSION_GROUPS } from "@/lib/rbac/permissions";
import { getUserById } from "@/lib/rbac/users";
import type { ActiveSession } from "@/lib/rbac/types";

type UserDetailSectionProps = {
  id: string;
  session: ActiveSession;
};

/** Streamed body: resolves the user after the shell has already painted. */
export async function UserDetailSection({ id, session }: UserDetailSectionProps) {
  const user = await getUserById(id);
  const actor = toClearanceActor(session);
  if (!user || !canManageUser(actor, user)) notFound();

  return (
    <>
      <PageHeader
        eyebrow="ملف المشغّل"
        title={user.name}
        description="القدرات الممنوحة والنطاق الجغرافي والرتبة الحالية لهذا المشغّل."
        actions={
          <span className="badge badge-gold">
            {clearanceLabel(user.clearanceLevel)} · L{user.clearanceLevel}
          </span>
        }
      />

      <UserDetail
        user={user}
        groups={PERMISSION_GROUPS.map((group) => ({
          name: group.name,
          items: group.items.map((permission) => ({
            key: permission.key,
            label: permission.label,
          })),
        }))}
      />
    </>
  );
}
