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
  const session = await requirePermission("manage_permissions");
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
        title="مركز التحكم بالصلاحيات"
        description="امنح واسحب القدرات الدقيقة لأي مشغّل. تتزامن الجلسات المفتوحة خلال خمس ثوانٍ، وتعيد حواجز الخادم التحقق في كل طلب."
        actions={
          <span className="badge badge-gold">
            رتبتك · {clearanceLabel(session.clearanceLevel)}
          </span>
        }
      />

      <Protect require="manage_permissions">
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

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">سلسلة التنفيذ</p>
            <h2>أربعة فحوص مستقلة</h2>
          </div>
        </div>
        <div className="enforcement-grid">
          <div>
            <span className="badge">1</span>
            <h3>الوسيط</h3>
            <p>
              يتحقق من الجلسة الموقّعة ويمنع روابط الوحدات غير المصرّح بها قبل
              عرض الصفحة.
            </p>
          </div>
          <div>
            <span className="badge">2</span>
            <h3>حاجز الخادم</h3>
            <p>
              كل صفحة تستدعي <code>requirePermission()</code> وتعيد قراءة مجموعة
              القدرات الحية، فلا يمكن لكوكي قديم تجاوز السحب.
            </p>
          </div>
          <div>
            <span className="badge">3</span>
            <h3>حاجز الرتبة</h3>
            <p>
              لا يمكن إدارة أو منح صلاحية لمشغّل يعادل رتبتك أو يتجاوزها، ولا
              إنشاء مشغّل خارج نطاق مدنك.
            </p>
          </div>
          <div>
            <span className="badge">4</span>
            <h3>بوابة المكوّن</h3>
            <p>
              المصفوفة لا تعرض إلا المشغّلين الأدنى منك رتبةً وداخل نطاقك
              الجغرافي، مع تعطيل الأزرار خارج ذلك.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
