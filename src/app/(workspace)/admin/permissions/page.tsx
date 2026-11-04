import { PermissionMatrixLoader } from "@/components/admin/permission-matrix-loader";
import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { clearanceLabel } from "@/lib/rbac/hierarchy";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Static shell for the RBAC matrix.
 *
 * Authorization runs here; the roster, assignable ladder and team catalogue
 * are fetched by the island from `/api/admin/users`, so the Edge render no
 * longer assembles the whole RBAC snapshot.
 */
export default async function PermissionsPage() {
  const session = await requirePermission("manage_system_users");

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
        <PermissionMatrixLoader />
      </Protect>
    </>
  );
}
