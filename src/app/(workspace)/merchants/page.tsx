import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { listCities, listMerchants } from "@/lib/field-ops/store";
import { CONTRACT_STATE_META } from "@/lib/field-ops/types";
import { smartTextScore } from "@/lib/search/normalize";

export const dynamic = "force-dynamic";

type MerchantsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function MerchantsPage({
  searchParams,
}: MerchantsPageProps) {
  await requirePermission("view_merchants");
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const cityMap = new Map(listCities().map((city) => [city.id, city]));
  const merchants =
    query.length > 0
      ? listMerchants()
          .map((merchant) => ({
            merchant,
            score: smartTextScore(query, merchant.name).score,
          }))
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)
          .map((entry) => entry.merchant)
      : listMerchants();

  return (
    <>
      <PageHeader
        eyebrow="Merchant operations"
        title="Merchant directory"
        description="Ownership, lifecycle state, and commercial data for every merchant on the network. Open a profile to manage documents, outcomes, and transfers."
        actions={<span className="badge">{merchants.length} merchants</span>}
      />

      <section className="panel">
        <form className="table-toolbar" action="/merchants" method="get">
          <div className="search-shell">
            <span>Search</span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Merchant, Arabic spelling, or typo"
              aria-label="Search merchants"
            />
          </div>
          <button type="submit" className="button button-quiet">
            Search
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>City</th>
                <th>Owner</th>
                <th>State</th>
                <th>Commission</th>
                <th className="align-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((merchant) => {
                const meta = CONTRACT_STATE_META[merchant.contractState];
                return (
                  <tr key={merchant.id}>
                    <td>
                      <Link href={`/merchants/${merchant.id}`}>
                        <strong>{merchant.name}</strong>
                      </Link>
                    </td>
                    <td>{cityMap.get(merchant.cityId)?.name ?? "—"}</td>
                    <td>
                      <span className="chip chip-team">{merchant.team}</span>
                    </td>
                    <td>
                      <span className={`badge ${meta.tone}`}>{meta.label}</span>
                    </td>
                    <td>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "EGP",
                        maximumFractionDigits: 0,
                      }).format(merchant.commissionAmount)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          href={`/merchants/${merchant.id}`}
                          className="button button-small button-quiet"
                        >
                          Open profile
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {merchants.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <p className="empty-state">
                      No merchant matched “{query}”. Try a shorter spelling.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
