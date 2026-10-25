import { PermissionMatrix } from "@/components/admin/permission-matrix";
import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { getRbacRevision, listUsers } from "@/lib/rbac/users";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const session = await requirePermission("manage_permissions");
  const users = listUsers();
  const revision = getRbacRevision();

  return (
    <>
      <PageHeader
        eyebrow="الحوكمة"
        title="مركز التحكم بالصلاحيات"
        description="امنح واسحب القدرات الدقيقة لأي مشغّل. تتزامن الجلسات المفتوحة خلال خمس ثوانٍ، وتعيد حواجز الخادم التحقق في كل طلب."
        actions={
          <span className="badge badge-green">
            {users.length} مشغّل · إصدار {revision}
          </span>
        }
      />

      <Protect require="manage_permissions">
        <PermissionMatrix
          initialUsers={users}
          initialRevision={revision}
          viewerId={session.user.id}
        />
      </Protect>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">سلسلة التنفيذ</p>
            <h2>ثلاثة فحوص مستقلة</h2>
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
            <h3>بوابة المكوّن</h3>
            <p>
              روابط الشريط الجانبي وأزرار الإجراءات تقيّم{" "}
              <code>hasPermission()</code> عبر <code>&lt;Protect&gt;</code>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
