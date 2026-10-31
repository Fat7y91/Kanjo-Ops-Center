import { MarketingView } from "@/components/marketing/marketing-view";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { listCities } from "@/lib/field-ops/store";
import {
  campaignProgress,
  listCampaigns,
  listMarketingEntries,
  listPlatformSettings,
} from "@/lib/marketing/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function MarketingPage() {
  const session = await requirePermission("manage_marketing_metrics");
  const campaigns = listCampaigns();
  const progress = campaignProgress();
  const entries = listMarketingEntries();
  const settings = listPlatformSettings();
  const cities = listCities().map((city) => ({ id: city.id, name: city.name }));

  return (
    <>
      <PageHeader
        eyebrow="التسويق"
        title="إدارة الحملات"
        description="أنشئ حملة بمداها وميزانيتها، سجّل نتائجها يوماً بيوم، ثم أوقفها أو أنهِها عند اكتمال هدفها."
        actions={
          <span className="badge badge-gold">{campaigns.length} حملة</span>
        }
      />

      <MarketingView
        campaigns={campaigns}
        progress={progress}
        entries={entries}
        settings={settings}
        cities={cities}
        canManage={session.permissions.includes("manage_marketing_metrics")}
      />
    </>
  );
}
