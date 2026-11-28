"use client";

import { Button } from "@/components/ui/button";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import { BI_MARKETING_META, BI_MARKETING_PLATFORM_META } from "@/lib/bi/types";
import {
  MARKETING_CAMPAIGN_STATUS_META,
  type CampaignProgress,
} from "@/lib/marketing/types";

type CampaignCardProps = {
  progress: CampaignProgress;
  busy: boolean;
  canManage: boolean;
  onStatus: (campaignId: string, status: "paused" | "active" | "closed") => void;
};

export function CampaignCard({
  progress,
  busy,
  canManage,
  onStatus,
}: CampaignCardProps) {
  const { campaign } = progress;
  const status = MARKETING_CAMPAIGN_STATUS_META[campaign.status];
  const budgetShare = Math.min(1, Math.max(0, progress.spentShare));
  const overspent = progress.spend > campaign.budget && campaign.budget > 0;

  return (
    <article className="marketing-campaign">
      <header className="marketing-campaign-head">
        <div>
          <h3>{campaign.name}</h3>
          <p className="marketing-campaign-meta">
            {BI_MARKETING_PLATFORM_META[campaign.platform]} ·{" "}
            {BI_MARKETING_META[campaign.channel]}
          </p>
        </div>
        <span className={`badge ${status.tone}`}>{status.label}</span>
      </header>

      <dl className="marketing-campaign-stats">
        <div>
          <dt>الإنفاق</dt>
          <dd dir="ltr">{currencyMoney(progress.spend, "EGP")}</dd>
        </div>
        <div>
          <dt>الميزانية</dt>
          <dd dir="ltr">{currencyMoney(campaign.budget, "EGP")}</dd>
        </div>
        <div>
          <dt>العملاء المحتملون</dt>
          <dd dir="ltr">
            {progress.leads.toLocaleString("en-US")}
            <span className="marketing-target">
              / {campaign.targetLeads.toLocaleString("en-US")}
            </span>
          </dd>
        </div>
        <div>
          <dt>التحويلات</dt>
          <dd dir="ltr">
            {progress.conversions.toLocaleString("en-US")}
            <span className="marketing-target">
              / {campaign.targetConversions.toLocaleString("en-US")}
            </span>
          </dd>
        </div>
      </dl>

      <div className="marketing-budget">
        <span className="marketing-budget-track" aria-hidden="true">
          <span
            className={`marketing-budget-fill${overspent ? " is-over" : ""}`}
            style={{ width: `${Math.round(budgetShare * 100)}%` }}
          />
        </span>
        <span className="marketing-budget-note">
          {overspent
            ? "تجاوزت الميزانية المعتمدة"
            : `المتبقي ${currencyMoney(
                Math.max(0, campaign.budget - progress.spend),
                "EGP",
              )}`}
        </span>
      </div>

      <footer className="marketing-campaign-foot">
        <span>
          {shortDate(campaign.startsOn)} — {shortDate(campaign.endsOn)}
        </span>
        <span>
          {campaign.status === "closed"
            ? "مغلقة"
            : `${progress.daysLeft} يوم متبقٍ`}
        </span>
      </footer>

      {canManage && campaign.status !== "closed" ? (
        <div className="marketing-campaign-actions">
          {campaign.status === "active" ? (
            <Button
              size="sm"
              variant="quiet"
              disabled={busy}
              onClick={() => onStatus(campaign.id, "paused")}
            >
              إيقاف مؤقت
            </Button>
          ) : (
            <Button
              size="sm"
              variant="quiet"
              disabled={busy}
              onClick={() => onStatus(campaign.id, "active")}
            >
              استئناف
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => onStatus(campaign.id, "closed")}
          >
            إنهاء الحملة
          </Button>
        </div>
      ) : null}
    </article>
  );
}
