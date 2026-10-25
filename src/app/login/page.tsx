import { loginAction } from "@/app/login/actions";
import { listUsers } from "@/lib/rbac/users";

export const dynamic = "force-dynamic";

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
            <p className="eyebrow">Kanjo Enterprise</p>
            <h1>Capability-based sign in</h1>
          </div>
        </div>

        <p className="login-intro">
          Choose a demo account. Every link, action, and route in V2 is gated by
          granular capability flags resolved from the active session, never by a
          job title or role name.
        </p>

        {params.error && (
          <p className="form-error" role="alert">
            That account is unavailable. Choose another profile.
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
              <span className="account-capabilities">
                {user.permissions.length} capabilities
              </span>
            </button>
          ))}
        </form>

        <p className="login-note">
          Sessions are signed with HMAC-SHA256 and re-resolved on every server
          request. Permission changes propagate to open clients within five
          seconds.
        </p>
      </section>
    </main>
  );
}
