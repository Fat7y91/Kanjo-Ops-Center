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
            <h1>تسجيل الدخول</h1>
          </div>
        </div>

        <LoginForm nextPath={nextPath} error={params.error} />
      </section>
    </main>
  );
}
