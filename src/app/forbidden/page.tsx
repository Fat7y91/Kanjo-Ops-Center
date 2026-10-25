import Link from "next/link";

import { getServerSession } from "@/lib/auth/server-session";
import { firstPermittedPath } from "@/lib/rbac/modules";

export const dynamic = "force-dynamic";

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
        <p className="eyebrow">Capability check failed</p>
        <h1>This surface is not granted to your session.</h1>
        <p className="page-description">
          {params.from
            ? `Access to ${params.from} was denied`
            : "Access was denied"}{" "}
          because the required capability is not in your active permission set.
        </p>

        {params.permission && (
          <div className="permission-callout">
            <span>Required capability</span>
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
              <span className="chip chip-muted">No capabilities granted</span>
            )}
          </div>
        )}

        <div className="forbidden-actions">
          <Link className="button button-primary" href={destination}>
            {session ? "Go to an allowed module" : "Sign in"}
          </Link>
          <Link className="button button-quiet" href="/login">
            Switch account
          </Link>
        </div>
      </section>
    </main>
  );
}
