import { MarketingView } from "@/components/marketing/marketing-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireModuleAccess } from "@/lib/auth/guard";
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
  const session = await requireModuleAccess("/marketing");
  const canViewCampaigns = session.permissions.includes("view_campaigns");
  const canCreate = session.permissions.includes("create_campaign");
  const canRecord = session.permissions.includes("record_campaign_results");
  const canViewLogs = session.permissions.includes("view_marketing_logs");
  const canManageSettings = session.permissions.includes(
    "manage_platform_settings",
  );

  // A settings-only operator never receives campaign or log data, and a
  // campaigns-only operator never receives platform credentials.
  const campaigns = canViewCampaigns ? listCampaigns() : [];
  const progress = canViewCampaigns ? campaignProgress() : [];
  const entries =
    canViewCampaigns || canViewLogs ? listMarketingEntries() : [];
  const settings = canManageSettings ? listPlatformSettings() : [];
  const cities =
    canCreate || canRecord
      ? listCities().map((city) => ({ id: city.id, name: city.name }))
      : [];

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
        canViewCampaigns={canViewCampaigns}
        canCreate={canCreate}
        canRecord={canRecord}
        canViewLogs={canViewLogs}
        canManageSettings={canManageSettings}
      />
    </>
  );
}
