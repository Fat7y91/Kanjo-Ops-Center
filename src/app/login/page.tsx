import { LoginForm } from "./login-form";

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
          سجّل الدخول برقم الهاتف وكلمة المرور. تُمنح الحسابات من الإدارة العليا
          فقط، ولا يوجد تسجيل ذاتي. كل رابط وإجراء محكوم بصلاحيات دقيقة تُستمد
          من جلستك النشطة، وليس من مسمى وظيفي.
        </p>

        <LoginForm nextPath={nextPath} error={params.error} />

        <p className="login-note">
          تُتحقق كلمة المرور عبر Supabase Auth، وتُوقّع جلسة التطبيق بـ
          HMAC-SHA256 ويُعاد التحقق منها في كل طلب إلى الخادم.
        </p>
      </section>
    </main>
  );
}
