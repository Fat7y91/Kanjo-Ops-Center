import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const columns = [
  {
    title: "Unassigned",
    tone: "badge-gold",
    tasks: [
      {
        merchant: "Cairo Fresh Market",
        detail: "Quarterly shelf audit",
        team: "No owner",
      },
      {
        merchant: "Zamalek Kitchen",
        detail: "Contract collection",
        team: "No owner",
      },
    ],
  },
  {
    title: "In progress",
    tone: "",
    tasks: [
      {
        merchant: "Nile Pharmacy Group",
        detail: "Expiry-date compliance visit",
        team: "Power Team",
      },
      {
        merchant: "Maadi Home Supplies",
        detail: "New category onboarding",
        team: "Fox Team",
      },
    ],
  },
  {
    title: "Awaiting approval",
    tone: "badge-green",
    tasks: [
      {
        merchant: "Heliopolis Pet Corner",
        detail: "Recovery visit report",
        team: "Fox Team",
      },
    ],
  },
];

export default async function FieldOpsPage() {
  await requirePermission("view_field_ops");

  return (
    <>
      <PageHeader
        eyebrow="Field operations"
        title="Execution board"
        description="Daily visits, ownership, and approval flow. Assignment and approval controls resolve from capabilities, not from who the operator is."
        actions={
          <Protect require="create_tasks">
            <button type="button" className="button button-primary">
              Create task
            </button>
          </Protect>
        }
      />

      <section className="board">
        {columns.map((column) => (
          <div key={column.title} className="board-column">
            <div className="board-head">
              <h2>{column.title}</h2>
              <span className={`badge ${column.tone}`}>
                {column.tasks.length}
              </span>
            </div>

            {column.tasks.map((task) => (
              <article key={task.merchant} className="task-card">
                <p className="eyebrow">{task.team}</p>
                <h3>{task.merchant}</h3>
                <p>{task.detail}</p>
                <div className="row-actions">
                  {column.title === "Unassigned" ? (
                    <Protect require="assign_tasks">
                      <button
                        type="button"
                        className="button button-small button-quiet"
                      >
                        Assign
                      </button>
                    </Protect>
                  ) : null}

                  {column.title === "Awaiting approval" ? (
                    <Protect require="approve_tasks">
                      <button
                        type="button"
                        className="button button-small button-primary"
                      >
                        Approve
                      </button>
                    </Protect>
                  ) : null}

                  <Protect require="edit_merchants">
                    <button
                      type="button"
                      className="button button-small button-quiet"
                    >
                      View merchant
                    </button>
                  </Protect>
                </div>
              </article>
            ))}
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Why this matters</p>
            <h2>Field authority is explicit</h2>
          </div>
        </div>
        <p className="panel-note">
          A coordinator can create a task without being able to approve it. A
          team lead can approve without being able to edit merchant records. Both
          are expressed as independent boolean capabilities.
        </p>
      </section>
    </>
  );
}
