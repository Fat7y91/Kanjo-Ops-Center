"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CampaignCard } from "@/components/marketing/campaign-card";
import { CampaignForm } from "@/components/marketing/campaign-form";
import { DailyEntryForm } from "@/components/marketing/marketing-entry-form";
import { SettingsPanel } from "@/components/marketing/settings-panel";
import { Tabs } from "@/components/ui/tabs";
import type {
  CampaignProgress,
  CampaignStatusInput,
  MarketingCampaign,
  MarketingEntry,
  PlatformSettings,
} from "@/lib/marketing/types";
import { currencyMoney, shortDate } from "@/lib/accounts/format";

type MarketingViewProps = {
  campaigns: MarketingCampaign[];
  progress: CampaignProgress[];
  entries: MarketingEntry[];
  settings: PlatformSettings[];
  cities: { id: string; name: string }[];
  canManage: boolean;
};

export function MarketingView({
  campaigns,
  progress,
  entries,
  settings,
  cities,
  canManage,
}: MarketingViewProps) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function done(message: string) {
    setNotice(message);
    router.refresh();
  }

  async function changeStatus(campaignId: string, status: CampaignStatusInput["status"]) {
    setBusyId(campaignId);
    setNotice("");
    try {
      const response = await fetch(`/api/marketing/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر تحديث الحملة.");
      done(
        status === "closed"
          ? "تم إنهاء الحملة."
          : status === "paused"
            ? "تم إيقاف الحملة مؤقتاً."
            : "تم استئناف الحملة.",
      );
    } catch (statusError) {
      setNotice(
        statusError instanceof Error
          ? statusError.message
          : "تعذر تحديث الحملة.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const campaignName = new Map(
    campaigns.map((campaign) => [campaign.id, campaign.name]),
  );

  return (
    <div className="marketing-view">
      {notice ? (
        <p className="accounts-notice" role="status">
          {notice}
        </p>
      ) : null}

      <Tabs
        items={[
          {
            id: "campaigns",
            label: `الحملات (${campaigns.length})`,
            content: (
              <div className="marketing-campaigns">
                {progress.length === 0 ? (
                  <p className="marketing-locked">
                    لا توجد حملات بعد. ابدأ بإنشاء حملة من تبويب «حملة جديدة».
                  </p>
                ) : (
                  progress.map((item) => (
                    <CampaignCard
                      key={item.campaign.id}
                      progress={item}
                      busy={busyId === item.campaign.id}
                      canManage={canManage}
                      onStatus={(campaignId, status) =>
                        void changeStatus(campaignId, status)
                      }
                    />
                  ))
                )}
              </div>
            ),
          },
          {
            id: "new-campaign",
            label: "حملة جديدة",
            content: canManage ? (
              <CampaignForm cities={cities} onDone={done} />
            ) : (
              <p className="marketing-locked">لا تملك صلاحية الإنشاء.</p>
            ),
          },
          {
            id: "entry",
            label: "نتائج يومية",
            content: canManage ? (
              <DailyEntryForm campaigns={campaigns} onDone={done} />
            ) : (
              <p className="marketing-locked">لا تملك صلاحية الإدخال.</p>
            ),
          },
          {
            id: "records",
            label: `السجلات (${entries.length})`,
            content: (
              <EntryTable
                entries={entries}
                campaignName={(id) => campaignName.get(id) ?? "—"}
              />
            ),
          },
          {
            id: "settings",
            label: "إعدادات المنصات",
            content: canManage ? (
              <SettingsPanel settings={settings} onDone={done} />
            ) : (
              <p className="marketing-locked">لا تملك صلاحية التعديل.</p>
            ),
          },
        ]}
      />
    </div>
  );
}

function EntryTable({
  entries,
  campaignName,
}: {
  entries: MarketingEntry[];
  campaignName: (id: string) => string;
}) {
  if (entries.length === 0) {
    return <p className="marketing-locked">لا توجد سجلات مسجّلة بعد.</p>;
  }

  return (
    <div className="payroll-table-wrap">
      <table className="payroll-table">
        <thead>
          <tr>
            <th>الحملة</th>
            <th>الإنفاق</th>
            <th>الظهور</th>
            <th>النقرات</th>
            <th>العملاء المحتملون</th>
            <th>التحويلات</th>
            <th>التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {[...entries]
            .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
            .map((entry) => (
              <tr key={entry.id}>
                <td>{campaignName(entry.campaignId)}</td>
                <td dir="ltr">{currencyMoney(entry.spend, "EGP")}</td>
                <td dir="ltr">{entry.impressions.toLocaleString("en-US")}</td>
                <td dir="ltr">{entry.clicks.toLocaleString("en-US")}</td>
                <td dir="ltr">{entry.leads.toLocaleString("en-US")}</td>
                <td dir="ltr">{entry.conversions.toLocaleString("en-US")}</td>
                <td>{shortDate(entry.occurredAt)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
