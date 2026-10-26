import Link from "next/link";

import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await requirePermission("view_overview");
  const firstName = session.user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow="مركز القيادة"
        title={`سعداء برؤيتك، ${firstName}`}
        description="رؤية حيّة لصحة التجار والتنفيذ الميداني والمخاطر التجارية. كل عنصر تحكم أدناه مستمد من مجموعة صلاحياتك."
        actions={
          <Protect require="view_contracts">
            <Link className="button button-primary" href="/contracts" prefetch>
              مراجعة العقود
            </Link>
          </Protect>
        }
      />

      <section
        className="stat-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="مؤشرات المؤسسة"
      >
        <StatCard
          label="التجار النشطون"
          value="1,284"
          detail="+38 هذا الشهر"
          tone="green"
        />
        <StatCard
          label="عقود تنتظر التوقيع"
          value="17"
          detail="4 تم تصعيدها هذا الأسبوع"
          tone="gold"
        />
        <StatCard
          label="زيارات ميدانية اليوم"
          value="42"
          detail="31 مكتملة، 11 مفتوحة"
        />
        <StatCard
          label="جودة الكتالوج"
          value="96.4%"
          detail="12 منتجاً يحتاج مراجعة"
          tone="green"
        />
      </section>

      <Protect require="view_finance">
        <section className="panel finance-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">لمحة مالية</p>
              <h2>الموقف التجاري</h2>
            </div>
            <span className="badge badge-gold">صلاحية مقيّدة</span>
          </div>
          <div className="finance-grid">
            <div>
              <span>المحصّل هذا الشهر</span>
              <strong>4.82M ج.م</strong>
            </div>
            <div>
              <span>التسويات المستحقة</span>
              <strong>312K ج.م</strong>
            </div>
            <div>
              <span>معدل التشغيل التعاقدي</span>
              <strong>58.1M ج.م</strong>
            </div>
          </div>
          <p className="panel-note">
            ظاهر لأن هذه الجلسة تحمل صلاحية <code>view_finance</code>.
          </p>
        </section>
      </Protect>

      <section className="two-column grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">العمليات</p>
              <h2>تركيز اليوم</h2>
            </div>
          </div>
          <ul className="activity-list">
            <li>
              <span className="activity-dot activity-dot-gold" />
              <div>
                <strong>4 عقود تجار تحتاج توقيعاً معتمداً</strong>
                <span>مكتب العقود · قبل 12 دقيقة</span>
              </div>
            </li>
            <li>
              <span className="activity-dot activity-dot-green" />
              <div>
                <strong>أكمل فريق فوكس 18 من 20 زيارة مخططة</strong>
                <span>العمليات الميدانية · قبل 34 دقيقة</span>
              </div>
            </li>
            <li>
              <span className="activity-dot" />
              <div>
                <strong>أنهت مراجعة الكتالوج 126 منتجاً</strong>
                <span>مكتب الكتالوج · قبل ساعة</span>
              </div>
            </li>
          </ul>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">صلاحياتك</p>
              <h2>القدرات النشطة</h2>
            </div>
            <span className="badge">{session.permissions.length}</span>
          </div>
          <div className="capability-chips">
            {session.permissions.map((permission) => (
              <span key={permission} className="chip">
                {permission}
              </span>
            ))}
          </div>
          <p className="panel-note">
            تُحدّث هذه القائمة من الخادم كل خمس ثوانٍ. تظهر المنح والسحوبات دون
            إعادة تحميل.
          </p>
        </article>
      </section>
    </>
  );
}
