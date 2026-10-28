"use client";

import Link from "next/link";

import { CONTRACT_STATE_META, teamLabel } from "@/lib/field-ops/types";
import type { Merchant } from "@/lib/field-ops/types";

type ProfileHeroProps = {
  merchant: Merchant;
  cityName: string;
  visitCount: number;
  otherTeam: boolean;
  canStartVisit: boolean;
  canViewFieldOpsPage: boolean;
  canRequestTransfers: boolean;
  canManageState: boolean;
  onStartVisit: () => void;
  onRequestTransfer: () => void;
  onOverrideState: () => void;
};

export function ProfileHero({
  merchant,
  cityName,
  visitCount,
  otherTeam,
  canStartVisit,
  canViewFieldOpsPage,
  canRequestTransfers,
  canManageState,
  onStartVisit,
  onRequestTransfer,
  onOverrideState,
}: ProfileHeroProps) {
  const meta = CONTRACT_STATE_META[merchant.contractState];

  return (
    <section className="profile-hero panel">
      <div>
        <p className="eyebrow">{cityName}</p>
        <h2>{merchant.name}</h2>
        <div className="profile-badges">
          <span className={`badge ${meta.tone}`}>{meta.label}</span>
          <span className="badge">{merchant.vendorType}</span>
          <span className="chip chip-team">{teamLabel(merchant.team)}</span>
          <span className="badge badge-purple">{visitCount} زيارة</span>
          {merchant.editUnlocked ? (
            <span className="badge badge-purple">التعديل مفتوح</span>
          ) : null}
          {otherTeam ? (
            <span className="badge badge-gold">مملوك لفريق آخر</span>
          ) : null}
        </div>
      </div>
      <div className="profile-actions">
        {canStartVisit ? (
          <button
            type="button"
            className="button button-primary"
            onClick={onStartVisit}
          >
            بدء زيارة
          </button>
        ) : null}
        {canViewFieldOpsPage ? (
          <Link href="/field-ops" className="button button-quiet" prefetch>
            العودة إلى اللوحة
          </Link>
        ) : null}
        {canRequestTransfers && otherTeam ? (
          <button
            type="button"
            className="button button-quiet"
            onClick={onRequestTransfer}
          >
            طلب نقل ملكية
          </button>
        ) : null}
        {canManageState ? (
          <button
            type="button"
            className="button button-quiet"
            onClick={onOverrideState}
          >
            تجاوز الحالة
          </button>
        ) : null}
      </div>
    </section>
  );
}
