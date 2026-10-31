"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MarketingEntryForm } from "@/components/marketing/marketing-entry-form";
import { SettingsPanel } from "@/components/marketing/settings-panel";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import type { MarketingEntry, PlatformSettings } from "@/lib/marketing/types";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import { BI_MARKETING_PLATFORM_META } from "@/lib/bi/types";

type MarketingViewProps = {
  entries: MarketingEntry[];
  settings: PlatformSettings[];
  cities: { id: string; name: string }[];
  canManage: boolean;
};

export function MarketingView({
  entries,
  settings,
  cities,
  canManage,
}: MarketingViewProps) {
  const router = useRouter();
  const [notice, setNotice] = useState("");

  function done(message: string) {
    setNotice(message);
    router.refresh();
  }

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
            id: "entry",
            label: "إدخال يدوي",
            content: canManage ? (
              <MarketingEntryForm cities={cities} onDone={done} />
            ) : (
              <p className="marketing-locked">لا تملك صلاحية الإدخال.</p>
            ),
          },
          {
            id: "records",
            label: `السجلات (${entries.length})`,
            content: <EntryTable entries={entries} />,
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

function EntryTable({ entries }: { entries: MarketingEntry[] }) {
  if (entries.length === 0) {
    return <p className="marketing-locked">لا توجد سجلات مسجّلة بعد.</p>;
  }

  return (
    <div className="payroll-table-wrap">
      <table className="payroll-table">
        <thead>
          <tr>
            <th>المنصة</th>
            <th>الحملة</th>
            <th>الإنفاق</th>
            <th>الظهور</th>
            <th>النقرات</th>
            <th>التحويلات</th>
            <th>التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {[...entries]
            .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
            .map((entry) => (
              <tr key={entry.id}>
                <td>{BI_MARKETING_PLATFORM_META[entry.platform]}</td>
                <td>{entry.campaign}</td>
                <td dir="ltr">{currencyMoney(entry.spend, "EGP")}</td>
                <td dir="ltr">{entry.impressions.toLocaleString("en-US")}</td>
                <td dir="ltr">{entry.clicks.toLocaleString("en-US")}</td>
                <td dir="ltr">{entry.conversions.toLocaleString("en-US")}</td>
                <td>{shortDate(entry.occurredAt)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
