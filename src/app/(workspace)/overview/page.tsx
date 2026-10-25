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
        eyebrow="Command center"
        title={`Good to see you, ${firstName}`}
        description="A live view of merchant health, field execution, and commercial risk. Every control below is resolved from your capability set."
        actions={
          <Protect require="view_contracts">
            <Link className="button button-primary" href="/contracts">
              Review contracts
            </Link>
          </Protect>
        }
      />

      <section className="stat-grid" aria-label="Enterprise metrics">
        <StatCard
          label="Active merchants"
          value="1,284"
          detail="+38 this month"
          tone="green"
        />
        <StatCard
          label="Contracts awaiting signature"
          value="17"
          detail="4 escalated this week"
          tone="gold"
        />
        <StatCard
          label="Field visits today"
          value="42"
          detail="31 completed, 11 open"
        />
        <StatCard
          label="Catalog quality"
          value="96.4%"
          detail="12 products need review"
          tone="green"
        />
      </section>

      <Protect require="view_finance">
        <section className="panel finance-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Finance snapshot</p>
              <h2>Commercial position</h2>
            </div>
            <span className="badge badge-gold">Restricted capability</span>
          </div>
          <div className="finance-grid">
            <div>
              <span>Collected this month</span>
              <strong>EGP 4.82M</strong>
            </div>
            <div>
              <span>Outstanding settlements</span>
              <strong>EGP 312K</strong>
            </div>
            <div>
              <span>Contracted run-rate</span>
              <strong>EGP 58.1M</strong>
            </div>
          </div>
          <p className="panel-note">
            Visible because this session holds{" "}
            <code>view_finance</code>.
          </p>
        </section>
      </Protect>

      <section className="two-column">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Operations</p>
              <h2>Today&apos;s focus</h2>
            </div>
          </div>
          <ul className="activity-list">
            <li>
              <span className="activity-dot activity-dot-gold" />
              <div>
                <strong>4 merchant contracts need authorized signature</strong>
                <span>Contracts desk · 12 minutes ago</span>
              </div>
            </li>
            <li>
              <span className="activity-dot activity-dot-green" />
              <div>
                <strong>Fox Team completed 18 of 20 planned visits</strong>
                <span>Field operations · 34 minutes ago</span>
              </div>
            </li>
            <li>
              <span className="activity-dot" />
              <div>
                <strong>Catalog review cleared 126 products</strong>
                <span>Catalog desk · 1 hour ago</span>
              </div>
            </li>
          </ul>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Your access</p>
              <h2>Active capabilities</h2>
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
            This list is refreshed from the server every five seconds. Grants and
            revocations appear without a reload.
          </p>
        </article>
      </section>
    </>
  );
}
