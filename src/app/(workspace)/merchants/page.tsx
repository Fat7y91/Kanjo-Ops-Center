import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const merchants = [
  {
    name: "Cairo Fresh Market",
    category: "Grocery",
    owner: "Fox Team",
    status: "Active",
    lastVisit: "2 hours ago",
  },
  {
    name: "Nile Pharmacy Group",
    category: "Pharmacy",
    owner: "Power Team",
    status: "Active",
    lastVisit: "Yesterday",
  },
  {
    name: "Zamalek Kitchen",
    category: "Restaurant",
    owner: "Fox Team",
    status: "Onboarding",
    lastVisit: "3 days ago",
  },
  {
    name: "Maadi Home Supplies",
    category: "Retail",
    owner: "Power Team",
    status: "Active",
    lastVisit: "5 hours ago",
  },
  {
    name: "Heliopolis Pet Corner",
    category: "Pets",
    owner: "Fox Team",
    status: "At risk",
    lastVisit: "9 days ago",
  },
];

const statusTone: Record<string, string> = {
  Active: "badge-green",
  Onboarding: "badge-gold",
  "At risk": "badge-red",
};

export default async function MerchantsPage() {
  await requirePermission("view_merchants");

  return (
    <>
      <PageHeader
        eyebrow="Merchant operations"
        title="Merchant directory"
        description="Ownership, lifecycle, and commercial actions for every merchant on the network. Actions are rendered only when their capability is granted."
        actions={
          <Protect require="create_merchants">
            <button type="button" className="button button-primary">
              New merchant
            </button>
          </Protect>
        }
      />

      <section className="panel">
        <div className="table-toolbar">
          <div className="search-shell">
            <span>Search</span>
            <input
              type="search"
              placeholder="Merchant, category, or owner"
              aria-label="Search merchants"
            />
          </div>
          <Protect require="transfer_merchants">
            <button type="button" className="button button-quiet">
              Bulk transfer
            </button>
          </Protect>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Category</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Last visit</th>
                <th className="align-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((merchant) => (
                <tr key={merchant.name}>
                  <td>
                    <strong>{merchant.name}</strong>
                  </td>
                  <td>{merchant.category}</td>
                  <td>{merchant.owner}</td>
                  <td>
                    <span
                      className={`badge ${statusTone[merchant.status] ?? ""}`}
                    >
                      {merchant.status}
                    </span>
                  </td>
                  <td className="muted">{merchant.lastVisit}</td>
                  <td>
                    <div className="row-actions">
                      <Protect require="edit_merchants">
                        <button
                          type="button"
                          className="button button-small button-quiet"
                        >
                          Edit
                        </button>
                      </Protect>
                      <Protect require="transfer_merchants">
                        <button
                          type="button"
                          className="button button-small button-quiet"
                        >
                          Transfer
                        </button>
                      </Protect>
                      <Protect require="delete_merchants">
                        <button
                          type="button"
                          className="button button-small button-danger"
                        >
                          Delete
                        </button>
                      </Protect>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="panel-note">
          Buttons are wrapped in <code>&lt;Protect&gt;</code> with merchant
          capabilities. No role or title is inspected anywhere in this page.
        </p>
      </section>
    </>
  );
}
