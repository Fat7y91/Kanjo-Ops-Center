import { Protect } from "@/components/auth/protect";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const products = [
  {
    name: "Organic olive oil 1L",
    merchant: "Cairo Fresh Market",
    price: "EGP 480",
    state: "Published",
    review: "Clear",
  },
  {
    name: "Paracetamol 500mg",
    merchant: "Nile Pharmacy Group",
    price: "EGP 35",
    state: "Published",
    review: "Clear",
  },
  {
    name: "Family meal box",
    merchant: "Zamalek Kitchen",
    price: "EGP 620",
    state: "Draft",
    review: "Image pending",
  },
  {
    name: "Cotton towel set",
    merchant: "Maadi Home Supplies",
    price: "EGP 290",
    state: "Published",
    review: "Price check",
  },
];

export default async function CatalogPage() {
  await requirePermission("view_catalog");

  return (
    <>
      <PageHeader
        eyebrow="Catalog governance"
        title="Product catalog"
        description="Pricing, publication state, and quality review for merchant products. Creation and destructive controls are capability-gated."
        actions={
          <Protect require="create_products">
            <button type="button" className="button button-primary">
              Add product
            </button>
          </Protect>
        }
      />

      <section className="toolbar-row">
        <span className="badge">4 products</span>
        <span className="badge badge-gold">1 draft</span>
        <span className="badge badge-red">1 needs review</span>
      </section>

      <section className="card-grid">
        {products.map((product) => (
          <article key={product.name} className="product-card">
            <div className="product-thumb" aria-hidden="true">
              <span>{product.name.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="product-body">
              <div className="panel-head compact">
                <div>
                  <p className="eyebrow">{product.merchant}</p>
                  <h2>{product.name}</h2>
                </div>
                <span
                  className={`badge ${
                    product.state === "Published" ? "badge-green" : "badge-gold"
                  }`}
                >
                  {product.state}
                </span>
              </div>
              <div className="product-meta">
                <strong>{product.price}</strong>
                <span>{product.review}</span>
              </div>
              <div className="row-actions">
                <Protect require="edit_products">
                  <button
                    type="button"
                    className="button button-small button-quiet"
                  >
                    Edit
                  </button>
                </Protect>
                <Protect require="delete_products">
                  <button
                    type="button"
                    className="button button-small button-danger"
                  >
                    Delete
                  </button>
                </Protect>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Governance note</p>
            <h2>Capability-driven controls</h2>
          </div>
        </div>
        <p className="panel-note">
          A catalog operator without <code>delete_products</code> never receives
          a delete control, while an edit-only reviewer keeps edit access. The
          server repeats the same check for every mutation request.
        </p>
      </section>
    </>
  );
}
