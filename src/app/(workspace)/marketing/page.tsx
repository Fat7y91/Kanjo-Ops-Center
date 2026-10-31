import { MarketingView } from "@/components/marketing/marketing-view";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/guard";
import { listCities } from "@/lib/field-ops/store";
import {
  listMarketingEntries,
  listPlatformSettings,
} from "@/lib/marketing/store";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function MarketingPage() {
  const session = await requirePermission("manage_marketing_metrics");
  const entries = listMarketingEntries();
  const settings = listPlatformSettings();
  const cities = listCities().map((city) => ({ id: city.id, name: city.name }));

  return (
    <>
      <PageHeader
        eyebrow="التسويق"
        title="قياس الحملات"
        description="إدخال يدوي لأرقام الإنفاق والظهور والنقرات والتحويلات لكل منصة، مع إعدادات المزامنة."
        actions={<span className="badge badge-gold">{entries.length} سجل</span>}
      />

      <MarketingView
        entries={entries}
        settings={settings}
        cities={cities}
        canManage={session.permissions.includes("manage_marketing_metrics")}
      />
    </>
  );
}
