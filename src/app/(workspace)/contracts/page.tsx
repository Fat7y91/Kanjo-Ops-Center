import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const contracts = [
  {
    id: "CTR-2041",
    merchant: "Cairo Fresh Market",
    value: "EGP 1,240,000",
    status: "Signed",
    signatory: "Authorized desk",
  },
  {
    id: "CTR-2042",
    merchant: "Nile Pharmacy Group",
    value: "EGP 860,000",
    status: "Signature required",
    signatory: "Pending",
  },
  {
    id: "CTR-2043",
    merchant: "Zamalek Kitchen",
    value: "EGP 410,000",
    status: "Draft",
    signatory: "Draft owner",
  },
  {
    id: "CTR-2044",
    merchant: "Maadi Home Supplies",
    value: "EGP 675,000",
    status: "Signature required",
    signatory: "Pending",
  },
];

const statusTone: Record<string, string> = {
  Signed: "badge-green",
  "Signature required": "badge-gold",
  Draft: "",
};

export default async function ContractsPage() {
  await requirePermission("view_contracts");

  return (
    <>
      <PageHeader
        eyebrow="Commercial governance"
        title="Contract register"
        description="Drafting, editing, and authorized signing are separate capabilities. Signing authority is never inferred from a job title."
        actions={
          <Protect require="create_contracts">
            <button type="button" className="button button-primary">
              Draft contract
            </button>
          </Protect>
        }
      />

      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Merchant</th>
                <th>Value</th>
                <th>Status</th>
                <th>Signatory</th>
                <th className="align-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td>
                    <strong>{contract.id}</strong>
                  </td>
                  <td>{contract.merchant}</td>
                  <td>{contract.value}</td>
                  <td>
                    <span
                      className={`badge ${statusTone[contract.status] ?? ""}`}
                    >
                      {contract.status}
                    </span>
                  </td>
                  <td className="muted">{contract.signatory}</td>
                  <td>
                    <div className="row-actions">
                      <Protect require="edit_contracts">
                        <button
                          type="button"
                          className="button button-small button-quiet"
                        >
                          Edit
                        </button>
                      </Protect>

                      {contract.status === "Signature required" && (
                        <Protect require="sign_contracts">
                          <button
                            type="button"
                            className="button button-small button-primary"
                          >
                            Sign
                          </button>
                        </Protect>
                      )}

                      <Protect require="delete_contracts">
                        <button
                          type="button"
                          className="button button-small button-danger"
                        >
                          Void
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
          The Sign control requires <code>sign_contracts</code>. A contract
          editor without that flag can change terms but can never sign.
        </p>
      </section>
    </>
  );
}
