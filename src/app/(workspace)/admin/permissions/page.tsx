import { PermissionMatrix } from "@/components/admin/permission-matrix";
import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { listCities } from "@/lib/field-ops/store";
import {
  assignableLevels,
  clearanceLabel,
  filterManageableUsers,
  isGlobalActor,
  toClearanceActor,
} from "@/lib/rbac/hierarchy";
import { listTeams } from "@/lib/rbac/teams";
import { getRbacRevision, listUsers } from "@/lib/rbac/users";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function PermissionsPage() {
  const session = await requirePermission("manage_system_users");
  const actor = toClearanceActor(session);
  const global = isGlobalActor(actor);
  const manageable = filterManageableUsers(actor, await listUsers());
  const revision = await getRbacRevision();
  const cities = listCities().filter(
    (city) => global || actor.accessibleCities.includes(city.id),
  );
  const teams = await listTeams();

  return (
    <>
      <PageHeader
        eyebrow="الحوكمة"
        title="مستخدمين النظام"
        description="إنشاء المستخدمين وإدارة رتبهم وصلاحياتهم ونطاق مدنهم. يظهر هنا المشغّلون الأدنى من رتبتك داخل مدنك، ويظهر حسابك دائماً حتى تتمكن من منح نفسك القدرات المضافة حديثاً. تتزامن الجلسات المفتوحة خلال خمس ثوانٍ."
        actions={
          <span className="badge badge-gold">
            رتبتك · {clearanceLabel(session.clearanceLevel)}
          </span>
        }
      />

      <Protect require="manage_system_users">
        <PermissionMatrix
          initialUsers={manageable}
          initialRevision={revision}
          viewerId={session.user.id}
          viewerLevel={actor.clearanceLevel}
          viewerGlobalScope={global}
          assignableLevels={assignableLevels(actor).map((level) => ({
            level: level.level,
            label: level.label,
          }))}
          assignableCities={cities.map((city) => ({
            id: city.id,
            name: city.name,
          }))}
          teams={teams}
        />
      </Protect>
    </>
  );
}
