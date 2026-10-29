import { loginAction } from "@/app/login/actions";
import { clearanceLabel, clearanceTone } from "@/lib/rbac/hierarchy";
import { listUsers } from "@/lib/rbac/users";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const users = listUsers().filter((user) => user.active);
  const nextPath =
    typeof params.next === "string" && params.next.startsWith("/")
      ? params.next
      : "";

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark brand-mark-large">K</span>
          <div>
            <p className="eyebrow">كانجو للمؤسسات</p>
            <h1>الدخول القائم على القدرات</h1>
          </div>
        </div>

        <p className="login-intro">
          اختر حساباً تجريبياً. كل رابط وإجراء ومسار في V2 محكوم بأعلام قدرات
          دقيقة تُستمد من الجلسة النشطة، وليس من مسمى وظيفي أو دور ثابت.
        </p>

        {params.error && (
          <p className="form-error" role="alert">
            هذا الحساب غير متاح. اختر ملفاً آخر.
          </p>
        )}

        <form action={loginAction} className="account-list">
          <input type="hidden" name="next" value={nextPath} />
          {users.map((user) => (
            <button
              key={user.id}
              type="submit"
              name="userId"
              value={user.id}
              className="account-card"
            >
              <span className="account-avatar">
                {user.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <span className="account-copy">
                <strong>{user.name}</strong>
                <span className="account-title">{user.title}</span>
                <span className="account-email">{user.email}</span>
              </span>
              <span className="account-badges">
                <span
                  className={`badge ${clearanceTone(user.clearanceLevel)}`}
                >
                  L{user.clearanceLevel} · {clearanceLabel(user.clearanceLevel)}
                </span>
                <span className="account-capabilities">
                  {user.permissions.length} صلاحية
                </span>
              </span>
            </button>
          ))}
        </form>

        <p className="login-note">
          تُوقّع الجلسات بـ HMAC-SHA256 ويُعاد التحقق منها في كل طلب إلى الخادم.
          تنتقل تغييرات الصلاحيات إلى العملاء المفتوحين خلال خمس ثوانٍ.
        </p>
      </section>
    </main>
  );
}
