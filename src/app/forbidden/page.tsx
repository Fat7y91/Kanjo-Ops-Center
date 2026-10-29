import Link from "next/link";

import { getServerSession } from "@/lib/auth/server-session";
import { firstPermittedPath } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type ForbiddenPageProps = {
  searchParams: Promise<{
    permission?: string;
    from?: string;
  }>;
};

export default async function ForbiddenPage({
  searchParams,
}: ForbiddenPageProps) {
  const params = await searchParams;
  const session = await getServerSession();
  const destination = session
    ? firstPermittedPath(session.permissions)
    : "/login";

  return (
    <main className="forbidden-shell">
      <section className="forbidden-card">
        <span className="forbidden-mark">403</span>
        <p className="eyebrow">فشل فحص القدرات</p>
        <h1>هذه الصفحة غير ممنوحة لجلساتك.</h1>
        <p className="page-description">
          {params.from
            ? `تم رفض الوصول إلى ${params.from}`
            : "تم رفض الوصول"}{" "}
          لأن القدرة المطلوبة غير موجودة في مجموعة صلاحياتك النشطة.
        </p>

        {params.permission && (
          <div className="permission-callout">
            <span>القدرة المطلوبة</span>
            <code>{params.permission}</code>
          </div>
        )}

        {session && (
          <div className="capability-chips">
            {session.permissions.length > 0 ? (
              session.permissions.map((permission) => (
                <span key={permission} className="chip">
                  {permission}
                </span>
              ))
            ) : (
              <span className="chip chip-muted">لا توجد قدرات ممنوحة</span>
            )}
          </div>
        )}

        <div className="forbidden-actions">
          <Link className="button button-primary" href={destination} prefetch>
            {session ? "الانتقال إلى وحدة مسموحة" : "تسجيل الدخول"}
          </Link>
          <Link className="button button-quiet" href="/login">
            تبديل الحساب
          </Link>
        </div>
      </section>
    </main>
  );
}
