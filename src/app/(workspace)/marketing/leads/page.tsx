import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
import { listMarketingLeads } from "@/lib/marketing-leads/repository";
import { listCampaigns } from "@/lib/marketing/store";
import { LeadsView } from "./components/leads-view";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * Inbound campaign leads (Spinwheel, landing, referrals).
 *
 * Distinct from campaign performance: these are people to follow up with, not
 * ad spend. The desk triages them through their lifecycle and can link a lead
 * to the campaign that produced it.
 */
export default async function MarketingLeadsPage() {
  const session = await requireModuleAccess("/marketing/leads");
  const canManage = session.permissions.includes("manage_marketing_leads");

  const [leads, campaigns] = await Promise.all([
    listMarketingLeads(),
    canManage ? listCampaigns().catch(() => []) : Promise.resolve([]),
  ]);

  const unavailable = leads === null;
  const list = leads ?? [];

  return (
    <>
      <PageHeader
        eyebrow="التسويق"
        title="عملاء الحملات"
        description="العملاء المحتملون الواردون من عجلة الحظ وصفحة الهبوط والإحالات. صنّفهم وربطهم بالحملة التي أنتجتهم."
        actions={<span className="badge badge-gold">{list.length} عميل</span>}
      />

      <LeadsView
        initialLeads={list}
        campaigns={campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
        }))}
        canManage={canManage}
        unavailable={unavailable}
      />
    </>
  );
}
