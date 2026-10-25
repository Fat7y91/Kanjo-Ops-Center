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
        eyebrow="Governance"
        title="Permission control plane"
        description="Grant and revoke granular capabilities for any operator. Open sessions reconcile within five seconds and server guards re-resolve on every request."
        actions={
          <span className="badge badge-green">
            {users.length} operators · rev {revision}
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
            <p className="eyebrow">Enforcement chain</p>
            <h2>Three independent checks</h2>
          </div>
        </div>
        <div className="enforcement-grid">
          <div>
            <span className="badge">1</span>
            <h3>Middleware</h3>
            <p>
              Verifies the signed session and blocks unauthorized module URLs
              before a page renders.
            </p>
          </div>
          <div>
            <span className="badge">2</span>
            <h3>Server guard</h3>
            <p>
              Each page calls <code>requirePermission()</code> and re-reads the
              live capability set, so a stale cookie cannot bypass a revocation.
            </p>
          </div>
          <div>
            <span className="badge">3</span>
            <h3>Component gate</h3>
            <p>
              Sidebar links and action buttons evaluate{" "}
              <code>hasPermission()</code> through <code>&lt;Protect&gt;</code>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
